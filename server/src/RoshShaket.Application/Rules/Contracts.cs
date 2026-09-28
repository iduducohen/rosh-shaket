using RoshShaket.Domain;

namespace RoshShaket.Application.Rules;

public sealed record RuleContext(EmploymentProfile Profile, ExitReason Reason, AnnualValues Values);

/// <summary>A rule that produces result lines. Add a new right = add a new class (Open/Closed).</summary>
public interface IRightsRule
{
    int Order { get; }
    IEnumerable<RightsComponent> Evaluate(RuleContext context);
}

/// <summary>A rule that produces advice text only (Interface Segregation: advice ≠ money).</summary>
public interface IAdvisoryRule
{
    IEnumerable<string> Advise(RuleContext context);
}

public static class SourceKeys
{
    public const string Severance = "severance";
    public const string Section14 = "section14";
    public const string Notice = "notice";
    public const string Vacation = "vacation";
    public const string Recuperation = "recuperation";
    public const string Unemployment = "unemployment";
    public const string ResignedJustified = "resigned-justified";
    public const string Hearing = "hearing";
    public const string PensionClearing = "pension-clearing";
}
