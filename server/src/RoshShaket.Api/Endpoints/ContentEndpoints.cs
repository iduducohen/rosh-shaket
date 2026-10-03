using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using RoshShaket.Application.UseCases;
using RoshShaket.Domain;
using RoshShaket.Infrastructure.Common;
using RoshShaket.Infrastructure.Mongo;

namespace RoshShaket.Api.Endpoints;

public static class ContentEndpoints
{
    public static IEndpointRouteBuilder MapContentEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api").WithTags("Content");

        group.MapGet("/checklist", async (ExitReason? reason, GetChecklistHandler handler, CancellationToken ct) =>
            TypedResults.Ok(await handler.HandleAsync(reason, ct)));

        group.MapGet("/sources", async (GetSourcesHandler handler, CancellationToken ct) =>
            TypedResults.Ok(await handler.HandleAsync(ct)));

        group.MapGet("/partners", async (string? kind, GetPartnersHandler handler, IServiceProvider services, CancellationToken ct) =>
        {
            if (kind is not (null or "Professional" or "Lawyer"))
                throw new DomainValidationException(new Dictionary<string, string> { ["kind"] = "בחרו איש מקצוע או עורך דין." });
            var offers = await handler.HandleAsync(kind, ct);
            // Ratings are extra: when the database is unavailable the list still shows, just without stars.
            IReadOnlyDictionary<string, RoshShaket.Infrastructure.Postgres.PartnerRating> ratings;
            try { ratings = await services.GetRequiredService<RoshShaket.Infrastructure.Postgres.IPartnerReviewStore>().RatingsAsync(ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { ratings = new Dictionary<string, RoshShaket.Infrastructure.Postgres.PartnerRating>(); }
            return TypedResults.Ok(offers.Select(o => new
            {
                o.Id, o.Name, o.Kind, o.Summary, o.Cooperation, o.DiscountPercent, o.Email, o.Whatsapp, o.Website, o.Specialty, o.Recommendations,
                RatingAverage = ratings.TryGetValue(o.Id, out var r) ? Math.Round(r.Average, 1) : (double?)null,
                RatingCount = ratings.TryGetValue(o.Id, out var c) ? c.Count : 0
            }).ToList());
        });

        // Diagnostic: shows whether Railway Mongo is reachable and seeded (Compass stays empty until this is ok).
        group.MapGet("/content-status", async (IMongoDatabase db, IOptions<MongoOptions> opts, CancellationToken ct) =>
        {
            var database = opts.Value.Database;
            try
            {
                using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct);
                budget.CancelAfter(TimeSpan.FromSeconds(3));
                await db.RunCommandAsync<BsonDocument>(new BsonDocument("ping", 1), cancellationToken: budget.Token);
                var sources = await db.GetCollection<BsonDocument>(MongoContentRepository.SourcesCollection)
                    .CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty, cancellationToken: budget.Token);
                var checklist = await db.GetCollection<BsonDocument>(MongoContentRepository.ChecklistCollection)
                    .CountDocumentsAsync(FilterDefinition<BsonDocument>.Empty, cancellationToken: budget.Token);
                return Results.Ok(new ContentStatusDto(
                    Mongo: "ok",
                    Database: database,
                    Sources: sources,
                    Checklist: checklist,
                    Serving: sources > 0 && checklist > 0 ? "mongo" : "embedded-until-seeded",
                    Error: null));
            }
            catch (Exception ex)
            {
                return Results.Ok(new ContentStatusDto(
                    Mongo: "unavailable",
                    Database: database,
                    Sources: null,
                    Checklist: null,
                    Serving: "embedded",
                    Error: ex.GetType().Name + ": " + ex.Message));
            }
        });

        return app;
    }

    private sealed record ContentStatusDto(
        string Mongo,
        string Database,
        long? Sources,
        long? Checklist,
        string Serving,
        string? Error);
}
