using RoshShaket.Application.Payslips;
using RoshShaket.Domain;

namespace RoshShaket.Application.Reports;

public sealed record ReportFundInput(
    string Kind,
    string? Name,
    decimal? Employee,
    decimal? Employer,
    string? Unit,
    string? Detail);

public sealed record BuildReportCommand(
    EmploymentProfile Profile,
    ExitReason? Reason,
    bool Compare,
    bool FromPayslip,
    string? PayslipMonth,
    IReadOnlyList<ReportFundInput> Funds);

public sealed record ChartSlice(string Key, string Label, decimal Value, string Unit);

public sealed record ReportComponentLine(
    string Code,
    string Title,
    decimal? Amount,
    string? DisplayValue,
    string Explanation,
    bool IncludedInTotal,
    string Certainty,
    string? Flag);

public sealed record ScenarioReport(
    ExitReason Reason,
    string ReasonLabel,
    decimal SeniorityYears,
    decimal EstimatedTotal,
    IReadOnlyList<ReportComponentLine> Components,
    IReadOnlyList<ChartSlice> EntitlementSlices,
    IReadOnlyList<string> Advisories,
    DateOnly ValuesValidFrom,
    decimal RecuperationDayValue);

public sealed record ReportBasis(
    DateOnly StartDate,
    DateOnly EndDate,
    decimal MonthlySalary,
    decimal JobPercent,
    WorkWeek WorkWeek,
    decimal VacationBalanceDays,
    decimal RecuperationDaysPaidLastYear,
    string Section14,
    bool HasStudyFund,
    bool FromPayslip,
    string? PayslipMonth);

public sealed record RightsReport(
    DateTimeOffset GeneratedAt,
    string Title,
    ReportBasis Basis,
    IReadOnlyList<ScenarioReport> Scenarios,
    IReadOnlyList<FundLine> Funds,
    IReadOnlyList<ChartSlice> EmployerFundSlices,
    IReadOnlyList<ChartSlice> EmployeeFundSlices,
    IReadOnlyList<ChartSlice> ScenarioTotalSlices,
    string Disclaimer);
