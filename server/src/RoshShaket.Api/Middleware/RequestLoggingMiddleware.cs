using System.Diagnostics;
using Microsoft.Extensions.Logging;

namespace RoshShaket.Api.Middleware;

internal sealed class RequestLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestLoggingMiddleware> _log;

    public RequestLoggingMiddleware(RequestDelegate next, ILogger<RequestLoggingMiddleware> log)
    {
        _next = next;
        _log = log;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            _log.LogInformation("Starting {Method} {Path}", context.Request.Method, context.Request.Path);
            await _next(context);
            sw.Stop();
            _log.LogInformation("Finished {Method} {Path} responded {StatusCode} in {ElapsedMilliseconds}ms",
                context.Request.Method, context.Request.Path, context.Response.StatusCode, sw.ElapsedMilliseconds);
        }
        catch (Exception ex)
        {
            sw.Stop();
            _log.LogError(ex, "Unhandled exception for {Method} {Path} after {ElapsedMilliseconds}ms", context.Request.Method, context.Request.Path, sw.ElapsedMilliseconds);
            throw;
        }
    }
}
