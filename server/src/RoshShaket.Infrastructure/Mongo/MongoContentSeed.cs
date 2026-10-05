using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;

namespace RoshShaket.Infrastructure.Mongo;

/// <summary>
/// Creates the app database/collections on startup and keeps the editorial content in step with
/// <see cref="EmbeddedContent"/>: every embedded source and checklist item is written by its key,
/// so new and reworded items reach a database that was seeded earlier.
/// Same data as server/db/mongo-init.js — so Railway Mongo does not need a manual Compass setup.
/// </summary>
public static class MongoContentSeed
{
    public static async Task EnsureAsync(IMongoDatabase db, ILogger log, CancellationToken ct = default)
    {
        var sources = db.GetCollection<BsonDocument>(MongoContentRepository.SourcesCollection);
        var checklist = db.GetCollection<BsonDocument>(MongoContentRepository.ChecklistCollection);

        await EnsureKeyIndexAsync(sources, "ux_sources_key", ct);
        await EnsureKeyIndexAsync(checklist, "ux_checklist_key", ct);

        var sourceDocs = EmbeddedContent.Sources.Select((s, i) => new BsonDocument
        {
            { "key", s.Key },
            { "order", i + 1 },
            { "title", s.Title },
            { "url", s.Url },
            { "description", s.Description }
        });
        var changedSources = await SyncAsync(sources, sourceDocs, ct);
        if (changedSources > 0)
            log.LogInformation("Synced {Count} Mongo sources into {Database}.{Collection}",
                changedSources, db.DatabaseNamespace.DatabaseName, MongoContentRepository.SourcesCollection);

        var checklistDocs = EmbeddedContent.Checklist.Select(i => new BsonDocument
        {
            { "key", i.Key },
            { "group", i.Group },
            { "order", i.Order },
            { "text", i.Text },
            { "tags", new BsonArray(i.Tags) },
            { "sourceKey", i.SourceKey is null ? BsonNull.Value : i.SourceKey }
        });
        var changedItems = await SyncAsync(checklist, checklistDocs, ct);
        if (changedItems > 0)
            log.LogInformation("Synced {Count} Mongo checklist items into {Database}.{Collection}",
                changedItems, db.DatabaseNamespace.DatabaseName, MongoContentRepository.ChecklistCollection);
    }

    /// <summary>
    /// A unique index on "key". mongo-init.js creates the same index under Mongo's default name,
    /// and asking for it again under another name is an error — so create it only when none exists.
    /// </summary>
    private static async Task EnsureKeyIndexAsync(IMongoCollection<BsonDocument> collection, string name, CancellationToken ct)
    {
        var existing = await (await collection.Indexes.ListAsync(ct)).ToListAsync(ct);
        var keyOnly = new BsonDocument("key", 1);
        if (existing.Any(i => i["key"].AsBsonDocument == keyOnly)) return;

        await collection.Indexes.CreateOneAsync(
            new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("key"),
                new CreateIndexOptions { Unique = true, Name = name }),
            cancellationToken: ct);
    }

    /// <summary>Writes each document by its key. Returns how many were added or changed.</summary>
    private static async Task<long> SyncAsync(IMongoCollection<BsonDocument> collection, IEnumerable<BsonDocument> docs, CancellationToken ct)
    {
        var writes = docs
            .Select(d => new UpdateOneModel<BsonDocument>(
                Builders<BsonDocument>.Filter.Eq("key", d["key"]),
                new BsonDocument("$set", d)) { IsUpsert = true })
            .ToList();
        if (writes.Count == 0) return 0;

        var result = await collection.BulkWriteAsync(writes, cancellationToken: ct);
        return result.ModifiedCount + result.Upserts.Count;
    }
}
