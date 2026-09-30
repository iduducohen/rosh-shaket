using RoshShaket.Application.Payslips;
using RoshShaket.Application.UseCases;
using RoshShaket.Domain;

namespace RoshShaket.Application.Reports;

public sealed class BuildReportHandler(CalculateRightsHandler calculate, CompareScenariosHandler compare)
{
    private static readonly IReadOnlyDictionary<string, string> FundTitles = new Dictionary<string, string>
    {
        ["pension"] = "פנסיה",
        ["severance"] = "הפרשת פיצויים",
        ["disability"] = "אובדן כושר עבודה",
        ["study"] = "קרן השתלמות"
    };

    private static readonly IReadOnlyDictionary<ExitReason, string> ReasonLabels = new Dictionary<ExitReason, string>
    {
        [ExitReason.Fired] = "פיטורים",
        [ExitReason.ResignedJustified] = "התפטרות בדין מפוטר",
        [ExitReason.Resigned] = "התפטרות",
        [ExitReason.ContractEnded] = "סיום חוזה"
    };

    public async Task<RightsReport> HandleAsync(BuildReportCommand cmd, CancellationToken ct)
    {
        IReadOnlyList<CalculationResult> results;
        if (cmd.Compare)
            results = await compare.HandleAsync(cmd.Profile, cmd.FromPayslip, ct);
        else
        {
            var reason = cmd.Reason ?? throw new DomainValidationException(new Dictionary<string, string>
            {
                ["reason"] = "חסרה סיבת עזיבה לדוח"
            });
            results = [await calculate.HandleAsync(new CalculateRightsCommand(cmd.Profile, reason, cmd.FromPayslip, false), ct)];
        }

        var scenarios = results.Select(MapScenario).ToList();
        var funds = NormalizeFunds(cmd.Funds);
        var (employer, employee) = BuildFundSlices(funds);
        var scenarioTotals = scenarios
            .Select(s => new ChartSlice(s.Reason.ToString(), s.ReasonLabel, s.EstimatedTotal, "ils"))
            .ToList();

        var title = scenarios.Count > 1
            ? "דוח השוואת תרחישים · יוצאים בראש שקט"
            : $"דוח זכויות · {scenarios[0].ReasonLabel}";

        return new RightsReport(
            DateTimeOffset.UtcNow,
            title,
            new ReportBasis(
                cmd.Profile.StartDate,
                cmd.Profile.EndDate,
                cmd.Profile.MonthlySalary,
                cmd.Profile.JobPercent,
                cmd.Profile.WorkWeek,
                cmd.Profile.VacationBalanceDays,
                cmd.Profile.RecuperationDaysPaidLastYear,
                cmd.Profile.Section14.ToString(),
                cmd.Profile.HasStudyFund,
                cmd.FromPayslip,
                cmd.PayslipMonth),
            scenarios,
            funds,
            employer,
            employee,
            scenarioTotals,
            "הערכה בלבד, לא ייעוץ משפטי. סכומים ברוטו לפני מס. שיעורי קופות לפי התלוש — לא יתרות בקופה.");
    }

    private static ScenarioReport MapScenario(CalculationResult r)
    {
        var label = ReasonLabels.TryGetValue(r.Reason, out var he) ? he : r.Reason.ToString();
        var components = r.Components.Select(c => new ReportComponentLine(
            c.Code, c.Title,
            c.Amount is { } a ? Math.Round(a, 0) : null,
            c.DisplayValue, c.Explanation, c.IncludedInTotal,
            c.Certainty.ToString(), c.Flag)).ToList();

        var slices = r.Components
            .Where(c => c.IncludedInTotal && c.Amount is > 0)
            .Select(c => new ChartSlice(c.Code, c.Title, Math.Round(c.Amount!.Value, 0), "ils"))
            .ToList();

        return new ScenarioReport(
            r.Reason,
            label,
            Math.Round(r.Seniority.Years, 2),
            Math.Round(r.EstimatedTotal, 0),
            components,
            slices,
            r.Advisories,
            r.ValuesUsed.ValidFrom,
            r.ValuesUsed.RecuperationDayValue);
    }

    private static IReadOnlyList<FundLine> NormalizeFunds(IReadOnlyList<ReportFundInput> inputs) =>
        inputs
            .Where(f => f.Kind is "pension" or "severance" or "disability" or "study")
            .Select(f => new FundLine(f.Kind, f.Name, f.Employee, f.Employer, f.Unit, f.Detail))
            .ToList();

    private static (IReadOnlyList<ChartSlice> Employer, IReadOnlyList<ChartSlice> Employee) BuildFundSlices(
        IReadOnlyList<FundLine> funds)
    {
        var employer = new List<ChartSlice>();
        var employee = new List<ChartSlice>();

        foreach (var group in funds.GroupBy(f => f.Kind))
        {
            var title = FundTitles.TryGetValue(group.Key, out var t) ? t : group.Key;
            var unit = group.Select(f => f.Unit).FirstOrDefault(u => u is "percent" or "amount") ?? "percent";
            var emp = group.Where(f => f.Employer is not null).Select(f => f.Employer!.Value).DefaultIfEmpty().Sum();
            var ee = group.Where(f => f.Employee is not null).Select(f => f.Employee!.Value).DefaultIfEmpty().Sum();
            if (emp > 0) employer.Add(new ChartSlice(group.Key, title, emp, unit == "amount" ? "ils" : "percent"));
            if (ee > 0) employee.Add(new ChartSlice(group.Key, title, ee, unit == "amount" ? "ils" : "percent"));
        }

        return (employer, employee);
    }
}
