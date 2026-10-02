using System.Text.Json;
using RoshShaket.Application.Rules.Contribution;
using RoshShaket.Domain.Employment;

namespace RoshShaket.Application.EmploymentReview;

public interface IEmploymentReviewStore
{
    Task<EmploymentReviewCase?> GetAsync(Guid workspaceId, CancellationToken ct);
    Task SaveAsync(EmploymentReviewCase review, CancellationToken ct);
}

public sealed record EmploymentReviewCase(
    Guid WorkspaceId,
    EmploymentPeriod? Period,
    IReadOnlyList<EmploymentMonth> Months,
    IReadOnlyList<FundAccount> Funds,
    IReadOnlyList<ReviewDocumentMeta> Documents,
    DateTimeOffset UpdatedAt,
    string? CurrentStep = null,
    JsonElement? DocumentWaivers = null);

// Client-owned OCR fields must round-trip, or each save wipes extracted salaries / funds.
public sealed record ReviewDocumentMeta(
    Guid Id,
    string DocumentType,
    int? Year,
    int? Month,
    string? Source,
    bool ParsedOk,
    string? ExtractedSummary,
    bool NeedsManualReview,
    string? FileName = null,
    string? StorageKey = null,
    long? FileSize = null,
    string? ServerDocumentId = null,
    string? ValidationStatus = null,
    string? ValidationMessage = null,
    string? DetectedType = null,
    int? DetectedYear = null,
    int? DetectedMonth = null,
    string? DetectedPeriodLabel = null,
    decimal? ExtractedGrossSalary = null,
    decimal? ExtractedAnnualGross = null,
    JsonElement? ExtractedFunds = null,
    IReadOnlyList<string>? ExtractedContributionKinds = null);

public sealed record UpsertPeriodRequest(
    Guid WorkspaceId,
    string? EmployerName,
    DateOnly StartDate,
    DateOnly EndDate,
    bool SameEmployerThroughout,
    string? ExitReason,
    bool HadWorkBreak,
    bool MultiplePeriods,
    string? Notes);

public sealed record SalarySegmentDto(DateOnly From, DateOnly? To, decimal GrossSalary, decimal? PensionableSalary);

public sealed record PatchMonthRequest(
    int Year,
    int Month,
    decimal? GrossSalary,
    decimal? PensionableSalary,
    decimal? ReportedEmployeePension,
    decimal? ReportedEmployerPension,
    decimal? ReportedCompensation,
    decimal? ReportedTrainingEmployee,
    decimal? ReportedTrainingEmployer,
    decimal? ActualEmployeePension,
    decimal? ActualEmployerPension,
    decimal? ActualCompensation,
    decimal? ActualTrainingEmployee,
    decimal? ActualTrainingEmployer,
    string? Flags);

public sealed class EmploymentReviewHandlers(
    IEmploymentReviewStore store,
    ContributionRulesEngine contributionRules)
{
    public async Task<EmploymentReviewCase> GetOrCreateAsync(Guid workspaceId, CancellationToken ct) =>
        await store.GetAsync(workspaceId, ct)
        ?? new EmploymentReviewCase(workspaceId, null, [], [], [], DateTimeOffset.UtcNow);

    public async Task<EmploymentReviewCase> SetPeriodAsync(UpsertPeriodRequest req, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(req.WorkspaceId, ct);
        var period = new EmploymentPeriod(
            existing.Period?.Id ?? Guid.NewGuid(),
            req.WorkspaceId,
            req.EmployerName,
            req.StartDate,
            req.EndDate,
            req.SameEmployerThroughout,
            req.ExitReason,
            req.HadWorkBreak,
            req.MultiplePeriods,
            req.Notes);

        IReadOnlyList<EmploymentMonth> months = EmploymentMonthFactory.GenerateEmpty(req.WorkspaceId, period.Id, req.StartDate, req.EndDate);
        if (existing.Months.Count > 0)
        {
            var map = existing.Months.ToDictionary(m => (m.Year, m.Month));
            months = months.Select(m => map.TryGetValue((m.Year, m.Month), out var old)
                ? old with { Id = m.Id, PeriodId = period.Id }
                : m).ToList();
        }

        var updated = existing with { Period = period, Months = months, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> ApplySalaryAsync(Guid workspaceId, IReadOnlyList<SalarySegmentDto> segments, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        if (existing.Period is null)
            throw new Domain.DomainValidationException(new Dictionary<string, string> { ["period"] = "הגדירו קודם את תקופת ההעסקה." });

        var months = EmploymentMonthFactory.ApplySalarySchedule(
            existing.Months,
            segments.Select(s => new SalarySegment(s.From, s.To, s.GrossSalary, s.PensionableSalary)).ToList());
        var updated = existing with { Months = months, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> RecalculateExpectedAsync(Guid workspaceId, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        var list = new List<EmploymentMonth>();
        foreach (var m in existing.Months)
        {
            var salary = m.PensionableSalary ?? m.GrossSalary;
            if (salary is null or <= 0)
            {
                list.Add(m);
                continue;
            }
            var monthStart = new DateOnly(m.Year, m.Month, 1);
            var expected = await contributionRules.ComputeExpectedAsync(salary.Value, monthStart, ct);
            list.Add(ContributionRulesEngine.ApplyExpected(m, expected));
        }
        var updated = existing with { Months = list, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> PatchMonthsAsync(Guid workspaceId, IReadOnlyList<PatchMonthRequest> patches, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        var map = existing.Months.ToDictionary(m => (m.Year, m.Month));
        foreach (var p in patches)
        {
            if (!map.TryGetValue((p.Year, p.Month), out var m)) continue;
            map[(p.Year, p.Month)] = m with
            {
                GrossSalary = p.GrossSalary ?? m.GrossSalary,
                PensionableSalary = p.PensionableSalary ?? m.PensionableSalary,
                EmployeePension = m.EmployeePension with
                {
                    Reported = p.ReportedEmployeePension ?? m.EmployeePension.Reported,
                    Actual = p.ActualEmployeePension ?? m.EmployeePension.Actual
                },
                EmployerPension = m.EmployerPension with
                {
                    Reported = p.ReportedEmployerPension ?? m.EmployerPension.Reported,
                    Actual = p.ActualEmployerPension ?? m.EmployerPension.Actual
                },
                EmployerCompensation = m.EmployerCompensation with
                {
                    Reported = p.ReportedCompensation ?? m.EmployerCompensation.Reported,
                    Actual = p.ActualCompensation ?? m.EmployerCompensation.Actual
                },
                TrainingFundEmployee = m.TrainingFundEmployee with
                {
                    Reported = p.ReportedTrainingEmployee ?? m.TrainingFundEmployee.Reported,
                    Actual = p.ActualTrainingEmployee ?? m.TrainingFundEmployee.Actual
                },
                TrainingFundEmployer = m.TrainingFundEmployer with
                {
                    Reported = p.ReportedTrainingEmployer ?? m.TrainingFundEmployer.Reported,
                    Actual = p.ActualTrainingEmployer ?? m.TrainingFundEmployer.Actual
                },
                Flags = p.Flags ?? m.Flags,
                Confidence = DataConfidence.Medium
            };
        }
        var updated = existing with
        {
            Months = map.Values.OrderBy(m => m.Year).ThenBy(m => m.Month).ToList(),
            UpdatedAt = DateTimeOffset.UtcNow
        };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> SetFundsAsync(Guid workspaceId, IReadOnlyList<FundAccount> funds, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        var updated = existing with { Funds = funds, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> AddDocumentMetaAsync(Guid workspaceId, ReviewDocumentMeta meta, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        var docs = existing.Documents.Where(d => d.Id != meta.Id).Append(meta).ToList();
        var updated = existing with { Documents = docs, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> RemoveDocumentMetaAsync(Guid workspaceId, Guid documentId, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        var docs = existing.Documents.Where(d => d.Id != documentId).ToList();
        var updated = existing with { Documents = docs, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> UpdateDocumentMetaAsync(Guid workspaceId, Guid documentId, ReviewDocumentMeta meta, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        if (existing.Documents.All(d => d.Id != documentId))
            throw new Domain.DomainValidationException(new Dictionary<string, string> { ["document"] = "המסמך לא נמצא." });
        var fixedMeta = meta with { Id = documentId };
        var docs = existing.Documents.Select(d => d.Id == documentId ? fixedMeta : d).ToList();
        var updated = existing with { Documents = docs, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    /// <summary>Full-case upsert used by the client to remember progress across steps / devices.</summary>
    public async Task<EmploymentReviewCase> SaveCaseAsync(EmploymentReviewCase review, CancellationToken ct)
    {
        var updated = review with { UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }

    public async Task<EmploymentReviewCase> SetCurrentStepAsync(Guid workspaceId, string? step, CancellationToken ct)
    {
        var existing = await GetOrCreateAsync(workspaceId, ct);
        var updated = existing with { CurrentStep = step, UpdatedAt = DateTimeOffset.UtcNow };
        await store.SaveAsync(updated, ct);
        return updated;
    }
}
