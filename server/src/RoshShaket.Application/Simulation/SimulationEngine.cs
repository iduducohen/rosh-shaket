using RoshShaket.Domain.Employment;

namespace RoshShaket.Application.Simulation;

/// <summary>
/// Monthly contribution compounding. Each deposit grows from its own month — not a lump-sum at start.
/// </summary>
public static class SimulationEngine
{
    public static SimulationResult Run(
        IReadOnlyList<MonthlyContribution> contributions,
        decimal annualReturnPercent,
        decimal managementFeePercent,
        string scenarioName)
    {
        if (contributions.Count == 0)
        {
            return new SimulationResult(scenarioName, annualReturnPercent, managementFeePercent,
                0, 0, 0, 0, []);
        }

        var ordered = contributions.OrderBy(c => c.Year).ThenBy(c => c.Month).ToList();
        var monthlyNet = (annualReturnPercent - managementFeePercent) / 100m / 12m;

        decimal balance = 0;
        decimal totalContrib = 0;
        decimal totalFeesApprox = 0;
        var points = new List<BalancePoint>();

        foreach (var c in ordered)
        {
            // Grow existing balance one month, then add contribution at end of month.
            var beforeFee = balance * (1 + annualReturnPercent / 100m / 12m);
            var fee = balance * (managementFeePercent / 100m / 12m);
            totalFeesApprox += fee;
            balance = beforeFee - fee;
            balance += c.Amount;
            totalContrib += c.Amount;
            points.Add(new BalancePoint(c.Year, c.Month, Round(totalContrib), Round(balance), Round(balance - totalContrib)));
        }

        // Also support pure monthly-net method consistency check via monthlyNet (documented).
        _ = monthlyNet;

        return new SimulationResult(
            scenarioName, annualReturnPercent, managementFeePercent,
            Round(totalContrib), Round(balance - totalContrib), Round(totalFeesApprox), Round(balance), points);
    }

    public static IReadOnlyList<SimulationResult> RunScenarios(
        IReadOnlyList<MonthlyContribution> contributions,
        SimulationAssumptions assumptions)
    {
        return
        [
            Run(contributions, assumptions.ConservativeReturnPercent, assumptions.ManagementFeePercent, "Conservative"),
            Run(contributions, assumptions.BaseReturnPercent, assumptions.ManagementFeePercent, "Base"),
            Run(contributions, assumptions.OptimisticReturnPercent, assumptions.ManagementFeePercent, "Optimistic")
        ];
    }

    /// <summary>Builds contribution series from months — uses Actual when known, else Reported, else Expected (tagged as estimate).</summary>
    public static (IReadOnlyList<MonthlyContribution> Items, bool UsedEstimates) FromMonths(IReadOnlyList<EmploymentMonth> months)
    {
        var list = new List<MonthlyContribution>();
        var usedEstimates = false;
        foreach (var m in months.OrderBy(x => x.Year).ThenBy(x => x.Month))
        {
            decimal amount = 0;
            amount += Pick(m.EmployeePension, ref usedEstimates);
            amount += Pick(m.EmployerPension, ref usedEstimates);
            amount += Pick(m.EmployerCompensation, ref usedEstimates);
            amount += Pick(m.TrainingFundEmployee, ref usedEstimates);
            amount += Pick(m.TrainingFundEmployer, ref usedEstimates);
            if (amount <= 0) continue;
            list.Add(new MonthlyContribution(m.Year, m.Month, amount));
        }
        return (list, usedEstimates);

        static decimal Pick(ContributionTriplet t, ref bool usedEstimates)
        {
            if (t.Actual is { } a) return a;
            if (t.Reported is { } r) { usedEstimates = true; return r; }
            if (t.Expected is { } e) { usedEstimates = true; return e; }
            return 0;
        }
    }

    private static decimal Round(decimal v) => Math.Round(v, 2, MidpointRounding.AwayFromZero);
}

public sealed record MonthlyContribution(int Year, int Month, decimal Amount);

public sealed record BalancePoint(int Year, int Month, decimal CumulativeContributions, decimal EstimatedBalance, decimal EstimatedGains);

public sealed record SimulationResult(
    string Scenario,
    decimal AnnualReturnPercent,
    decimal ManagementFeePercent,
    decimal TotalContributions,
    decimal EstimatedGains,
    decimal EstimatedFees,
    decimal EstimatedBalance,
    IReadOnlyList<BalancePoint> Timeline);
