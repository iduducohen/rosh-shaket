using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.DataProtection;
using RoshShaket.Api.Catalog;
using RoshShaket.Api.Composition;
using RoshShaket.Api.Endpoints;
using RoshShaket.Api.Errors;
using RoshShaket.Application.Abstractions;
using RoshShaket.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Configure simple, structured console logging. Uses built-in providers only so restore doesn't add packages.
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o => { o.IncludeScopes = true; o.TimestampFormat = "yyyy-MM-dd HH:mm:ss "; });

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration);

builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ApiExceptionHandler>();
builder.Services.AddHealthChecks();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<IPartnerCatalog>(sp =>
    new JsonPartnerCatalog(Path.Combine(builder.Environment.ContentRootPath, "partners.json"),
        sp.GetRequiredService<ILogger<JsonPartnerCatalog>>()));

// Sign-in: the API issues its own short-lived bearer tokens (+ refresh tokens) after verifying the provider.
builder.Services.AddAuthentication(BearerTokenDefaults.AuthenticationScheme)
    .AddBearerToken(o =>
    {
        o.BearerTokenExpiration = TimeSpan.FromHours(1);
        o.RefreshTokenExpiration = TimeSpan.FromDays(30);
    });
builder.Services.AddAuthorization();
// BearerToken payloads are protected by ASP.NET Data Protection.
// Keys MUST outlive the container: on Railway every deploy replaces the filesystem,
// so we store the key ring in Postgres (same DB as users). Optional KeysPath is a local/dev fallback only.
var dpBuilder = builder.Services.AddDataProtection().SetApplicationName("rosh-shaket");
var postgres = builder.Configuration.GetConnectionString("Postgres");
if (!string.IsNullOrWhiteSpace(postgres))
{
    dpBuilder.PersistKeysToDbContext<RoshShaket.Infrastructure.Postgres.RightsDbContext>();
    builder.Logging.AddFilter("Microsoft.AspNetCore.DataProtection", LogLevel.Information);
    Console.WriteLine("DataProtection: persisting keys to Postgres (data_protection_keys).");
}
else
{
    var keysPath = builder.Configuration["DataProtection:KeysPath"];
    var dir = string.IsNullOrWhiteSpace(keysPath)
        ? Path.Combine(Path.GetTempPath(), "rosh-shaket-dp-keys")
        : keysPath;
    dpBuilder.PersistKeysToFileSystem(new DirectoryInfo(dir));
    Console.WriteLine($"DataProtection: WARNING — no ConnectionStrings:Postgres; keys at {dir} (ephemeral on Railway).");
}

builder.Services.AddCors(o => o.AddPolicy("app", p =>
{
    var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
    var exactOrigins = origins.Where(o => !o.Contains("*")).ToArray();
    p.WithOrigins(exactOrigins).AllowAnyHeader().AllowAnyMethod();
    // Allow any vercel.app subdomain for preview deployments
    p.SetIsOriginAllowed(origin =>
        exactOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase) ||
        (Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
         uri.Host.EndsWith(".vercel.app", StringComparison.OrdinalIgnoreCase)));
}));

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    // The quick check is free but each read costs real AI money: a small burst, then a slow refill per IP.
    var quickBurst = builder.Configuration.GetValue("Billing:QuickCheckBurst", 10);
    var quickPerHour = builder.Configuration.GetValue("Billing:QuickCheckPerHour", 4);
    o.AddPolicy(PayslipEndpoints.RateLimitPolicy, ctx => RateLimitPartition.GetTokenBucketLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = quickBurst,
            TokensPerPeriod = 1,
            ReplenishmentPeriod = TimeSpan.FromMinutes(60.0 / Math.Max(1, quickPerHour)),
            QueueLimit = 0
        }));
    o.AddPolicy(DocumentVerifyEndpoints.RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy(AuthEndpoints.RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy(AuthEndpoints.EmailStartRateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy(HelpEndpoints.RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy(ReviewEndpoints.RateLimitPolicy, ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 5, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();

// CorrelationId must be very early so logs and exception handlers can include it
app.UseMiddleware<RoshShaket.Api.Middleware.CorrelationIdMiddleware>();
// Request logging records timing and surface-level errors
app.UseMiddleware<RoshShaket.Api.Middleware.RequestLoggingMiddleware>();

app.UseExceptionHandler();
app.UseCors("app");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.UseSwagger();
app.UseSwaggerUI();

app.MapHealthChecks("/health");
app.MapCalculationEndpoints();
app.MapReportEndpoints();
app.MapWorkspaceEndpoints();
app.MapPayslipEndpoints();
app.MapDocumentVerifyEndpoints();
app.MapContentEndpoints();
app.MapAuthEndpoints();
app.MapHelpEndpoints();
app.MapReviewEndpoints();
app.MapEmploymentReviewEndpoints();
app.MapBillingEndpoints();

// End-to-end tests run the API in memory with fake stores and skip the real databases.
if (app.Configuration.GetValue("Database:InitializeOnStartup", true))
    await app.Services.InitializeDatabasesAsync();
app.Run();

public partial class Program;
