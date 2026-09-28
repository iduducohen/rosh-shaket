namespace RoshShaket.Domain.Content;

public sealed record ChecklistItem(string Key, string Group, int Order, string Text, IReadOnlyList<string> Tags, string? SourceKey)
{
    public const string AllTag = "all";
    public bool AppliesTo(string reasonTag) => Tags.Contains(AllTag) || Tags.Contains(reasonTag);
}

public sealed record RightsSource(string Key, string Title, string Url, string Description);

public static class ExitReasonTags
{
    public static string ToTag(ExitReason reason) => reason switch
    {
        ExitReason.Fired => "fired",
        ExitReason.ResignedJustified => "justified",
        ExitReason.Resigned => "resigned",
        ExitReason.ContractEnded => "contract",
        _ => throw new ArgumentOutOfRangeException(nameof(reason))
    };
}
