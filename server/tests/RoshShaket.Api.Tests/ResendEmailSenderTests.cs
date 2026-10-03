using System.Net;
using System.Text.Json;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using RoshShaket.Infrastructure.Auth;
using Xunit;

namespace RoshShaket.Api.Tests;

public class ResendEmailSenderTests
{
    private sealed class Capture(HttpStatusCode status = HttpStatusCode.OK) : HttpMessageHandler
    {
        public HttpRequestMessage? Request;
        public JsonElement Body;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Request = request;
            Body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct)).RootElement.Clone();
            return new HttpResponseMessage(status) { Content = new StringContent("{\"id\":\"e1\"}") };
        }
    }

    private static (ResendEmailSender sender, Capture http) Build(AuthOptions o, HttpStatusCode status = HttpStatusCode.OK)
    {
        var capture = new Capture(status);
        var client = new HttpClient(capture) { BaseAddress = new Uri("https://api.resend.com/") };
        return (new ResendEmailSender(client, Options.Create(o), NullLogger<ResendEmailSender>.Instance), capture);
    }

    private static AuthOptions ResendSmtp() => new()
    {
        Smtp = new SmtpOptions { Host = "smtp.resend.com", User = "resend", Password = "re_test_key", From = "onboarding@resend.dev" }
    };

    [Fact]
    public async Task Uses_the_dashboard_template_with_the_code_as_a_variable()
    {
        var o = ResendSmtp();
        o.Resend.Templates["LoginCode"] = "901faaad-1564-4a2d-a969-90cb8f2a7316";
        var (sender, http) = Build(o);

        await sender.SendLoginCodeAsync("user@example.com", "482913", default);

        http.Request!.RequestUri!.ToString().Should().Be("https://api.resend.com/emails");
        http.Request.Headers.Authorization!.ToString().Should().Be("Bearer re_test_key", "the SMTP key is reused for the API");
        http.Body.GetProperty("template").GetProperty("id").GetString().Should().Be("901faaad-1564-4a2d-a969-90cb8f2a7316");
        http.Body.GetProperty("template").GetProperty("variables").GetProperty("CODE").GetString().Should().Be("482913");
        http.Body.GetProperty("subject").GetString().Should().Contain("482913");
        http.Body.TryGetProperty("html", out _).Should().BeFalse("Resend rejects html together with a template");
        http.Body.GetProperty("to")[0].GetString().Should().Be("user@example.com");
    }

    [Fact]
    public async Task Falls_back_to_the_built_in_html_when_no_template_is_configured()
    {
        var (sender, http) = Build(ResendSmtp());

        await sender.SendLoginCodeAsync("user@example.com", "482913", default);

        http.Body.TryGetProperty("template", out _).Should().BeFalse();
        http.Body.GetProperty("html").GetString().Should().Contain("482913");
        http.Body.GetProperty("from").GetString().Should().Be("onboarding@resend.dev");
    }

    [Fact]
    public async Task A_rejected_send_surfaces_as_an_error()
    {
        var o = ResendSmtp();
        o.Resend.Templates["LoginCode"] = "missing-template";
        var (sender, _) = Build(o, HttpStatusCode.UnprocessableEntity);

        await FluentActions.Awaiting(() => sender.SendLoginCodeAsync("user@example.com", "1", default))
            .Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public void An_explicit_api_key_wins_and_plain_smtp_hosts_do_not_leak_their_password()
    {
        new ResendOptions { ApiKey = "re_api" }.ResolveApiKey(new SmtpOptions { Host = "smtp.resend.com", Password = "re_smtp" }).Should().Be("re_api");
        new ResendOptions().ResolveApiKey(new SmtpOptions { Host = "smtp.gmail.com", Password = "secret" }).Should().BeEmpty();
    }
}
