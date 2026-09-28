using RoshShaket.Application.Rules;
using RoshShaket.Domain;

namespace RoshShaket.Application.Calculation;

public interface IRightsCalculator
{
    CalculationResult Calculate(RuleContext context);
}

/// <summary>Runs every registered rule. Knows nothing about specific rights (Open/Closed, Dependency Inversion).</summary>
public sealed class RightsCalculator(IEnumerable<IRightsRule> rules, IEnumerable<IAdvisoryRule> advisories) : IRightsCalculator
{
    private readonly IReadOnlyList<IRightsRule> _rules = rules.OrderBy(r => r.Order).ToList();
    private readonly IReadOnlyList<IAdvisoryRule> _advisories = advisories.ToList();

    public CalculationResult Calculate(RuleContext context)
    {
        var components = _rules.SelectMany(r => r.Evaluate(context)).ToList();
        var advice = _advisories.SelectMany(a => a.Advise(context)).ToList();
        return new CalculationResult(context.Reason, context.Profile.Seniority, components, advice, context.Values);
    }
}
