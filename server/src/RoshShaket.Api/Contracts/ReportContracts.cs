using RoshShaket.Application.Reports;
using RoshShaket.Domain;

namespace RoshShaket.Api.Contracts;

public sealed record ReportFundDto(
    string Kind,
    string? Name,
    decimal? Employee,
    decimal? Employer,
    string? Unit,
    string? Detail);

public sealed record BuildReportRequest(
    ProfileDto Profile,
    ExitReason? Reason,
    bool Compare = false,
    bool FromPayslip = false,
    string? PayslipMonth = null,
    IReadOnlyList<ReportFundDto>? Funds = null);

public sealed record ChartSliceDto(string Key, string Label, decimal Value, string Unit);

public sealed record ReportComponentDto(
    string Code,
    string Title,
    decimal? Amount,
    string? DisplayValue,
    string Explanation,
    bool IncludedInTotal,
    string Certainty,
    string? Flag);

public sealed record ScenarioReportDto(
    ExitReason Reason,
    string ReasonLabel,
    decimal SeniorityYears,
    decimal EstimatedTotal,
    IReadOnlyList<ReportComponentDto> Components,
    IReadOnlyList<ChartSliceDto> EntitlementSlices,
    IReadOnlyList<string> Advisories,
    DateOnly ValuesValidFrom,
    decimal RecuperationDayValue);

public sealed record ReportBasisDto(
    DateOnly StartDate,
    DateOnly EndDate,
    decimal MonthlySalary,
    decimal JobPercent,
    string WorkWeek,
    decimal VacationBalanceDays,
    decimal RecuperationDaysPaidLastYear,
    string Section14,
    bool HasStudyFund,
    bool FromPayslip,
    string? PayslipMonth);

public sealed record RightsReportDto(
    DateTimeOffset GeneratedAt,
    string Title,
    ReportBasisDto Basis,
    IReadOnlyList<ScenarioReportDto> Scenarios,
    IReadOnlyList<ReportFundDto> Funds,
    IReadOnlyList<ChartSliceDto> EmployerFundSlices,
    IReadOnlyList<ChartSliceDto> EmployeeFundSlices,
    IReadOnlyList<ChartSliceDto> ScenarioTotalSlices,
    string Disclaimer)
{
    public static RightsReportDto From(RightsReport r) => new(
        r.GeneratedAt,
        r.Title,
        new ReportBasisDto(
            r.Basis.StartDate, r.Basis.EndDate, r.Basis.MonthlySalary, r.Basis.JobPercent,
            r.Basis.WorkWeek.ToString(), r.Basis.VacationBalanceDays, r.Basis.RecuperationDaysPaidLastYear,
            r.Basis.Section14, r.Basis.HasStudyFund, r.Basis.FromPayslip, r.Basis.PayslipMonth),
        r.Scenarios.Select(s => new ScenarioReportDto(
            s.Reason, s.ReasonLabel, s.SeniorityYears, s.EstimatedTotal,
            s.Components.Select(c => new ReportComponentDto(
                c.Code, c.Title, c.Amount, c.DisplayValue, c.Explanation, c.IncludedInTotal, c.Certainty, c.Flag)).ToList(),
            s.EntitlementSlices.Select(x => new ChartSliceDto(x.Key, x.Label, x.Value, x.Unit)).ToList(),
            s.Advisories, s.ValuesValidFrom, s.RecuperationDayValue)).ToList(),
        r.Funds.Select(f => new ReportFundDto(f.Kind, f.Name, f.Employee, f.Employer, f.Unit, f.Detail)).ToList(),
        r.EmployerFundSlices.Select(x => new ChartSliceDto(x.Key, x.Label, x.Value, x.Unit)).ToList(),
        r.EmployeeFundSlices.Select(x => new ChartSliceDto(x.Key, x.Label, x.Value, x.Unit)).ToList(),
        r.ScenarioTotalSlices.Select(x => new ChartSliceDto(x.Key, x.Label, x.Value, x.Unit)).ToList(),
        r.Disclaimer);
}
