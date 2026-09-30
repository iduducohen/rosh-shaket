namespace RoshShaket.Infrastructure.Common;

public sealed class ClaudeOptions
{
    public const string Section = "Claude";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "claude-sonnet-5";
    public string BaseUrl { get; set; } = "https://api.anthropic.com/";
    public int MaxTokens { get; set; } = 8192;
    public int TimeoutSeconds { get; set; } = 90;
}

public sealed class CacheOptions
{
    public const string Section = "Cache";
    public int AnnualValuesMinutes { get; set; } = 60;
    public int ContentMinutes { get; set; } = 30;
}

public sealed class MongoOptions
{
    public const string Section = "Mongo";
    public string Database { get; set; } = "rosh_shaket";
}
