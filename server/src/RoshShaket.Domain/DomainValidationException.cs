namespace RoshShaket.Domain;

public sealed class DomainValidationException(IReadOnlyDictionary<string, string> errors)
    : Exception("Invalid input: " + string.Join("; ", errors.Select(e => $"{e.Key}: {e.Value}")))
{
    public IReadOnlyDictionary<string, string> Errors { get; } = errors;
}
