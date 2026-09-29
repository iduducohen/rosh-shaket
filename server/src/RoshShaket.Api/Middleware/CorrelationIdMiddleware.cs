using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace RoshShaket.Api.Middleware;

internal sealed class CorrelationIdMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<CorrelationIdMiddleware> _log;

    public CorrelationIdMiddleware(RequestDelegate next, ILogger<CorrelationIdMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        const string Header = "X-Correlation-ID";

        var cid = context.Request.Headers.TryGetValue(Header, out var existing) && !string.IsNullOrWhiteSpace(existing)
            ? existing.ToString()
            : Activity.Current?.Id ?? Guid.NewGuid().ToString();

        context.Request.Headers[Header] = cid;
        context.Response.Headers[Header] = cid;

        using (_log.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = cid }))
        {
            await _next(context);
        }
    }
}
