using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;
using MongoDB.Driver;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain.Content;

namespace RoshShaket.Infrastructure.Mongo;

/// <summary>Editorial content lives in Mongo: flexible documents, easy to edit and to localize later.</summary>
public sealed class MongoContentRepository(IMongoDatabase db) : IContentRepository
{
    public const string ChecklistCollection = "checklist_items";
    public const string SourcesCollection = "sources";

    private readonly IMongoCollection<ChecklistDoc> _checklist = db.GetCollection<ChecklistDoc>(ChecklistCollection);
    private readonly IMongoCollection<SourceDoc> _sources = db.GetCollection<SourceDoc>(SourcesCollection);

    public async Task<IReadOnlyList<ChecklistItem>> GetChecklistAsync(CancellationToken ct)
    {
        var docs = await _checklist.Find(FilterDefinition<ChecklistDoc>.Empty).SortBy(d => d.Order).ToListAsync(ct);
        return docs.Select(d => new ChecklistItem(d.Key, d.Group, d.Order, d.Text, d.Tags, d.SourceKey)).ToList();
    }

    public async Task<IReadOnlyList<RightsSource>> GetSourcesAsync(CancellationToken ct)
    {
        var docs = await _sources.Find(FilterDefinition<SourceDoc>.Empty).SortBy(d => d.Order).ToListAsync(ct);
        return docs.Select(d => new RightsSource(d.Key, d.Title, d.Url, d.Description)).ToList();
    }

    [BsonIgnoreExtraElements]
    private sealed class ChecklistDoc
    {
        [BsonId] public ObjectId Id { get; set; }
        [BsonElement("key")] public string Key { get; set; } = "";
        [BsonElement("group")] public string Group { get; set; } = "";
        [BsonElement("order")] public int Order { get; set; }
        [BsonElement("text")] public string Text { get; set; } = "";
        [BsonElement("tags")] public List<string> Tags { get; set; } = [];
        [BsonElement("sourceKey")] public string? SourceKey { get; set; }
    }

    [BsonIgnoreExtraElements]
    private sealed class SourceDoc
    {
        [BsonId] public ObjectId Id { get; set; }
        [BsonElement("key")] public string Key { get; set; } = "";
        [BsonElement("order")] public int Order { get; set; }
        [BsonElement("title")] public string Title { get; set; } = "";
        [BsonElement("url")] public string Url { get; set; } = "";
        [BsonElement("description")] public string Description { get; set; } = "";
    }
}
