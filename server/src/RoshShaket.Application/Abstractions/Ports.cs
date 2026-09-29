using RoshShaket.Domain;
using RoshShaket.Domain.Content;
using RoshShaket.Application.Payslips;

namespace RoshShaket.Application.Abstractions;

// Ports (Dependency Inversion): the application defines what it needs; Infrastructure implements it.

/// <summary>Annual legal values (Postgres), valid for a given date.</summary>
public interface IAnnualValuesProvider
{
    Task<AnnualValues> GetForDateAsync(DateOnly date, CancellationToken ct);
}

/// <summary>Editorial content: checklist items and official sources (Mongo).</summary>
public interface IContentRepository
{
    Task<IReadOnlyList<ChecklistItem>> GetChecklistAsync(CancellationToken ct);
    Task<IReadOnlyList<RightsSource>> GetSourcesAsync(CancellationToken ct);
}

/// <summary>Professionals and lawyers offered for paid help. Edited without a database.</summary>
public interface IPartnerCatalog
{
    Task<IReadOnlyList<PartnerOffer>> GetAsync(CancellationToken ct);
}

/// <summary>Reads structured fields from payslip images (an LLM behind the scenes). Must never return identifiers.</summary>
public interface IPayslipExtractor
{
    Task<PayslipExtraction> ExtractAsync(IReadOnlyList<PayslipImage> images, CancellationToken ct);
}

/// <summary>Anonymous statistics, written only with the user's consent (Postgres).</summary>
public interface ICalculationLog
{
    Task RecordAsync(AnonymizedCalculation record, CancellationToken ct);
}

/// <summary>Key–value cache (Redis).</summary>
public interface ICacheStore
{
    Task<T?> GetAsync<T>(string key, CancellationToken ct);
    Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct);
    Task RemoveAsync(string key, CancellationToken ct);
}

public interface IClock
{
    DateOnly Today { get; }
    DateTimeOffset Now { get; }
}

public sealed record AnonymizedCalculation(
    DateTimeOffset CreatedAt,
    ExitReason Reason,
    int SeniorityYearsBucket,
    Section14Arrangement Section14,
    decimal EstimatedTotalRounded,
    bool FromPayslip);
