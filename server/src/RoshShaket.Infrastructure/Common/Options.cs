namespace RoshShaket.Infrastructure.Common;

public sealed class ClaudeOptions
{
    public const string Section = "Claude";
    public string ApiKey { get; set; } = "";
    public string Model { get; set; } = "claude-sonnet-5";
    public string BaseUrl { get; set; } = "https://api.anthropic.com/";
    public int MaxTokens { get; set; } = 8192;
    public int TimeoutSeconds { get; set; } = 90;
    /// <summary>
    /// Reasoning depth for document reading (low | medium | high | xhigh | max). Output tokens are most of
    /// the cost; reading a form rarely needs deep reasoning. Empty = model default.
    /// </summary>
    public string? Effort { get; set; } = "low";

    /// <summary>output_config with the JSON schema, plus effort when one is set.</summary>
    public Dictionary<string, object> OutputConfig(System.Text.Json.JsonElement schema)
    {
        var config = new Dictionary<string, object> { ["format"] = new { type = "json_schema", schema } };
        if (!string.IsNullOrWhiteSpace(Effort)) config["effort"] = Effort.Trim().ToLowerInvariant();
        return config;
    }
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
