using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using RoshShaket.Api.Composition;
using RoshShaket.Api.Endpoints;
using RoshShaket.Api.Errors;
using RoshShaket.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration);

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddHealthChecks();

builder.Services.AddCors(o => o.AddPolicy("app", p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy(PayslipEndpoints.RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

app.UseExceptionHandler();
app.UseCors("app");
app.UseRateLimiter();

app.MapHealthChecks("/health");
app.MapCalculationEndpoints();
app.MapPayslipEndpoints();
app.MapContentEndpoints();

await app.Services.InitializeDatabasesAsync();
app.Run();

public partial class Program;
