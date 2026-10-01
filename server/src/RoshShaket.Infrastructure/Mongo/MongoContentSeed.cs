using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;

namespace RoshShaket.Infrastructure.Mongo;

/// <summary>
/// Creates the app database/collections on startup and seeds editorial content when empty.
/// Same data as server/db/mongo-init.js — so Railway Mongo does not need a manual Compass setup.
/// </summary>
public static class MongoContentSeed
{
    public static async Task EnsureAsync(IMongoDatabase db, ILogger log, CancellationToken ct = default)
    {
        var sources = db.GetCollection<BsonDocument>(MongoContentRepository.SourcesCollection);
        var checklist = db.GetCollection<BsonDocument>(MongoContentRepository.ChecklistCollection);

        await sources.Indexes.CreateOneAsync(
            new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("key"),
                new CreateIndexOptions { Unique = true, Name = "ux_sources_key" }),
            cancellationToken: ct);

        await checklist.Indexes.CreateOneAsync(
            new CreateIndexModel<BsonDocument>(
                Builders<BsonDocument>.IndexKeys.Ascending("key"),
                new CreateIndexOptions { Unique = true, Name = "ux_checklist_key" }),
            cancellationToken: ct);

        // Creating an index / inserting documents materializes the database in Compass.
        var sourceCount = await sources.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty, cancellationToken: ct);
        if (sourceCount == 0)
        {
            var docs = EmbeddedContent.Sources.Select((s, i) => new BsonDocument
            {
                { "key", s.Key },
                { "order", i + 1 },
                { "title", s.Title },
                { "url", s.Url },
                { "description", s.Description }
            });
            await sources.InsertManyAsync(docs, cancellationToken: ct);
            log.LogInformation("Seeded {Count} Mongo sources into {Database}.{Collection}",
                EmbeddedContent.Sources.Count, db.DatabaseNamespace.DatabaseName, MongoContentRepository.SourcesCollection);
        }

        var checklistCount = await checklist.CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty, cancellationToken: ct);
        if (checklistCount == 0)
        {
            var docs = EmbeddedContent.Checklist.Select(i => new BsonDocument
            {
                { "key", i.Key },
                { "group", i.Group },
                { "order", i.Order },
                { "text", i.Text },
                { "tags", new BsonArray(i.Tags) },
                { "sourceKey", i.SourceKey is null ? BsonNull.Value : i.SourceKey }
            });
            await checklist.InsertManyAsync(docs, cancellationToken: ct);
            log.LogInformation("Seeded {Count} Mongo checklist items into {Database}.{Collection}",
                EmbeddedContent.Checklist.Count, db.DatabaseNamespace.DatabaseName, MongoContentRepository.ChecklistCollection);
        }
    }
}
