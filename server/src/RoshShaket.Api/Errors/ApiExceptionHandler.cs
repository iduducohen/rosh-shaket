using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using RoshShaket.Application.Auth;
using RoshShaket.Application.Payslips;
using RoshShaket.Domain;

namespace RoshShaket.Api.Errors;

/// <summary>Maps known exceptions to RFC 7807 problem details, with Hebrew titles the client can show as-is.</summary>
internal sealed class ApiExceptionHandler(IProblemDetailsService problemDetails, ILogger<ApiExceptionHandler> log) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        var (status, title, errors) = exception switch
        {
            DomainValidationException v => (StatusCodes.Status400BadRequest, "נתונים לא תקינים", v.Errors),
            PayslipExtractionException p => (StatusCodes.Status422UnprocessableEntity, p.Message, (IReadOnlyDictionary<string, string>?)null),
            AuthenticationFailedException a => (StatusCodes.Status401Unauthorized, a.Message, (IReadOnlyDictionary<string, string>?)null),
            BadHttpRequestException => (StatusCodes.Status400BadRequest, "בקשה לא תקינה", (IReadOnlyDictionary<string, string>?)null),
            _ => (StatusCodes.Status500InternalServerError, "שגיאה בשרת", (IReadOnlyDictionary<string, string>?)null)
        };

        // Attach correlation id from header (if present) to the log message for easier correlation
        var correlationId = context.Request.Headers.TryGetValue("X-Correlation-ID", out var cid) ? cid.ToString() : null;
        if (status >= 500) log.LogError(exception, "Unhandled exception while processing {Path} CorrelationId={CorrelationId}", context.Request.Path, correlationId);

        var details = new ProblemDetails { Status = status, Title = title };
        if (errors is not null) details.Extensions["errors"] = errors;

        context.Response.StatusCode = status;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = details,
            Exception = exception
        });
    }
}
