namespace RoshShaket.Domain.Employment;

public enum FundKind
{
    Pension,
    Severance,
    Study,
    Managers
}

public enum DataConfidence
{
    High,
    Medium,
    Low,
    Unknown
}

public enum HealthStatus
{
    Healthy,
    NeedsReview,
    GapsFound,
    InsufficientData
}

public enum AnomalyKind
{
    MissingMonth,
    LowContribution,
    LateContribution,
    PayrollVsFundGap,
    Form106Gap,
    UnusualChange,
    NoInformation
}

/// <summary>One continuous employment stretch with a single employer.</summary>
public sealed record EmploymentPeriod(
    Guid Id,
    Guid WorkspaceId,
    string? EmployerName,
    DateOnly StartDate,
    DateOnly EndDate,
    bool SameEmployerThroughout,
    string? ExitReason,
    bool HadWorkBreak,
    bool MultiplePeriods,
    string? Notes);

/// <summary>
/// Unified monthly ledger. Missing Actual/Reported stay null — never treat unknown as zero.
/// </summary>
public sealed record EmploymentMonth(
    Guid Id,
    Guid PeriodId,
    Guid WorkspaceId,
    int Year,
    int Month,
    decimal? GrossSalary,
    decimal? PensionableSalary,
    ContributionTriplet EmployeePension,
    ContributionTriplet EmployerPension,
    ContributionTriplet EmployeeCompensation,
    ContributionTriplet EmployerCompensation,
    ContributionTriplet TrainingFundEmployee,
    ContributionTriplet TrainingFundEmployer,
    decimal? OtherExpected,
    decimal? OtherReported,
    decimal? OtherActual,
    DateOnly? ContributionDate,
    Guid? SourceDocumentId,
    DataConfidence Confidence,
    string? Flags);

/// <summary>Expected / Reported / Actual for one contribution line. Null = unknown.</summary>
public sealed record ContributionTriplet(decimal? Expected, decimal? Reported, decimal? Actual)
{
    public decimal? GapReportedVsExpected =>
        Expected is null || Reported is null ? null : Reported.Value - Expected.Value;

    public decimal? GapActualVsExpected =>
        Expected is null || Actual is null ? null : Actual.Value - Expected.Value;

    public bool HasUnknown => Expected is null || Reported is null || Actual is null;
}

public sealed record ContributionRule(
    Guid Id,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo,
    decimal PensionEmployeeRate,
    decimal PensionEmployerRate,
    decimal CompensationRate,
    decimal TrainingFundEmployeeRate,
    decimal TrainingFundEmployerRate,
    decimal? SalaryCeiling,
    string SourceNote,
    bool IsEstimate,
    /// <summary>
    /// Monthly salary the training fund is usually paid on (the tax-exempt ceiling). Employers commonly
    /// deposit up to it, so a deposit capped there is not a shortfall.
    /// </summary>
    decimal? TrainingFundSalaryCeiling = null);

public sealed record FundAccount(
    Guid Id,
    Guid WorkspaceId,
    FundKind Kind,
    decimal? Balance,
    DateOnly? AsOf,
    string? Provider,
    decimal? FeeAnnualPercent,
    decimal? ReturnAnnualPercent,
    string? Track,
    DataConfidence Confidence);

public sealed record Anomaly(
    Guid Id,
    Guid WorkspaceId,
    int Year,
    int Month,
    FundKind? Fund,
    AnomalyKind Kind,
    string Severity,
    string Explanation,
    DataConfidence Confidence);

public sealed record SimulationAssumptions(
    decimal ConservativeReturnPercent,
    decimal BaseReturnPercent,
    decimal OptimisticReturnPercent,
    decimal ManagementFeePercent);

public static class DefaultSimulationAssumptions
{
    public static SimulationAssumptions Current { get; } = new(3m, 5m, 7m, 0.5m);
}
