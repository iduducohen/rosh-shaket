using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;
using RoshShaket.Application.Auth;

namespace RoshShaket.Api.Endpoints;

public sealed record ExternalSignInRequest(AuthProvider Provider, string? IdToken, string? Code, string? Name);
public sealed record EmailStartRequest(string Email);
public sealed record EmailVerifyRequest(string Email, string Code);
public sealed record RefreshRequest(string RefreshToken);
public sealed record LogoutRequest(string? RefreshToken);
public sealed record LinkRequest(AuthProvider Provider, string? IdToken, string? Code, string? Name);
public sealed record MeResponse(string Id, string? Email, string? Name, string? Provider);
public sealed record LinkedIdentityResponse(string Provider, DateTimeOffset LinkedAt);

public static class AuthEndpoints
{
    public const string RateLimitPolicy = "auth";
    public const string EmailStartRateLimitPolicy = "auth-email-start";

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        // Public client ids for the browser SDKs, and which providers are enabled.
        group.MapGet("/providers", (ExternalSignInHandler handler) => TypedResults.Ok(handler.Providers()));

        group.MapPost("/external", async (ExternalSignInRequest req, ExternalSignInHandler handler, CancellationToken ct) =>
                SignIn(await handler.HandleAsync(req.Provider, new ExternalCredential(req.IdToken, req.Code, req.Name), ct), req.Provider))
            .RequireRateLimiting(RateLimitPolicy);

        group.MapPost("/email/start", async (EmailStartRequest req, EmailCodeSignInHandler handler, CancellationToken ct) =>
            {
                await handler.StartAsync(req.Email, ct);
                // Generic success — does not reveal whether the address is registered.
                return TypedResults.NoContent();
            })
            .RequireRateLimiting(EmailStartRateLimitPolicy);

        group.MapPost("/email/verify", async (EmailVerifyRequest req, EmailCodeSignInHandler handler, CancellationToken ct) =>
                SignIn(await handler.VerifyAsync(req.Email, req.Code, ct), AuthProvider.Email))
            .RequireRateLimiting(RateLimitPolicy);

        group.MapPost("/refresh", async Task<Results<SignInHttpResult, UnauthorizedHttpResult>> (
                RefreshRequest req,
                IOptionsMonitor<BearerTokenOptions> options,
                IRefreshTokenDenylist denylist,
                CancellationToken ct) =>
            {
                if (string.IsNullOrWhiteSpace(req.RefreshToken) || await denylist.IsRevokedAsync(req.RefreshToken, ct))
                    return TypedResults.Unauthorized();

                var protector = options.Get(BearerTokenDefaults.AuthenticationScheme).RefreshTokenProtector;
                var ticket = protector.Unprotect(req.RefreshToken);
                if (ticket?.Properties.ExpiresUtc is not { } expires || DateTimeOffset.UtcNow >= expires)
                    return TypedResults.Unauthorized();
                return TypedResults.SignIn(ticket.Principal, authenticationScheme: BearerTokenDefaults.AuthenticationScheme);
            })
            .RequireRateLimiting(RateLimitPolicy);

        // Allow anonymous so an expired access token can still revoke the refresh token.
        group.MapPost("/logout", async (
                LogoutRequest? req,
                IOptionsMonitor<BearerTokenOptions> options,
                IRefreshTokenDenylist denylist,
                ILoggerFactory logFactory,
                CancellationToken ct) =>
            {
                var refresh = req?.RefreshToken;
                if (!string.IsNullOrWhiteSpace(refresh))
                {
                    var protector = options.Get(BearerTokenDefaults.AuthenticationScheme).RefreshTokenProtector;
                    var ticket = protector.Unprotect(refresh);
                    var ttl = ticket?.Properties.ExpiresUtc is { } expires
                        ? expires - DateTimeOffset.UtcNow
                        : TimeSpan.FromDays(30);
                    if (ttl > TimeSpan.Zero)
                        await denylist.RevokeAsync(refresh, ttl, ct);
                }

                logFactory.CreateLogger("Auth").LogInformation("auth_logout");
                return TypedResults.NoContent();
            })
            .RequireRateLimiting(RateLimitPolicy);

        group.MapGet("/me", (ClaimsPrincipal user) => TypedResults.Ok(new MeResponse(
                user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
                user.FindFirstValue(ClaimTypes.Email),
                user.FindFirstValue(ClaimTypes.Name),
                user.FindFirstValue("provider"))))
            .RequireAuthorization();

        group.MapGet("/identities", async (ClaimsPrincipal user, AccountLinkingHandler linking, CancellationToken ct) =>
            {
                var id = UserId(user);
                var list = await linking.ListAsync(id, ct);
                return TypedResults.Ok(list.Select(i => new LinkedIdentityResponse(i.Provider.ToString(), i.LinkedAt)));
            })
            .RequireAuthorization();

        group.MapPost("/link", async (LinkRequest req, ClaimsPrincipal user, AccountLinkingHandler linking, CancellationToken ct) =>
            {
                await linking.LinkAsync(UserId(user), req.Provider, new ExternalCredential(req.IdToken, req.Code, req.Name), ct);
                return TypedResults.NoContent();
            })
            .RequireAuthorization()
            .RequireRateLimiting(RateLimitPolicy);

        group.MapDelete("/link/{provider}", async (AuthProvider provider, ClaimsPrincipal user, AccountLinkingHandler linking, CancellationToken ct) =>
            {
                await linking.UnlinkAsync(UserId(user), provider, ct);
                return TypedResults.NoContent();
            })
            .RequireAuthorization()
            .RequireRateLimiting(RateLimitPolicy);

        return app;
    }

    private static Guid UserId(ClaimsPrincipal user) =>
        Guid.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? throw new AuthenticationFailedException("נדרשת התחברות."));

    private static SignInHttpResult SignIn(AppUser user, AuthProvider provider)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new("provider", provider.ToString())
        };
        if (user.Email is not null) claims.Add(new Claim(ClaimTypes.Email, user.Email));
        if (user.Name is not null) claims.Add(new Claim(ClaimTypes.Name, user.Name));

        var principal = new ClaimsPrincipal(new ClaimsIdentity(claims, BearerTokenDefaults.AuthenticationScheme));
        return TypedResults.SignIn(principal, authenticationScheme: BearerTokenDefaults.AuthenticationScheme);
    }
}
