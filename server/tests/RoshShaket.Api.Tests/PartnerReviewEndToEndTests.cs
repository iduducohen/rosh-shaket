using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;

namespace RoshShaket.Api.Tests;

/// <summary>Own fixture (own rate limiter): these tests sign in several users.</summary>
public class PartnerReviewEndToEndTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private async Task<HttpClient> SignedInClient(string email)
    {
        var client = factory.CreateClient();
        (await client.PostAsJsonAsync("/api/auth/email/start", new { email })).EnsureSuccessStatusCode();
        var verify = await client.PostAsJsonAsync("/api/auth/email/verify", new { email, code = factory.Email.Codes[email] });
        verify.EnsureSuccessStatusCode();
        var token = (await verify.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Fact]
    public async Task Partner_reviews_are_public_to_read_and_one_per_user_to_write()
    {
        const string partner = "sample-lawyer-partner";
        var guest = factory.CreateClient();
        (await guest.PutAsJsonAsync($"/api/partners/{partner}/reviews/me", new { rating = 5, text = "מעולה" })).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var dana = await SignedInClient("reviewer-dana@example.com");
        (await dana.PutAsJsonAsync($"/api/partners/{partner}/reviews/me", new { rating = 9 })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await dana.PutAsJsonAsync("/api/partners/no-such-partner/reviews/me", new { rating = 4 })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await dana.PutAsJsonAsync($"/api/partners/{partner}/reviews/me", new { rating = 2, text = "איטי" })).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await dana.PutAsJsonAsync($"/api/partners/{partner}/reviews/me", new { rating = 4, text = "בסוף עזרו מאוד" })).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var avi = await SignedInClient("reviewer-avi@example.com");
        (await avi.PutAsJsonAsync($"/api/partners/{partner}/reviews/me", new { rating = 5 })).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var listed = await guest.GetFromJsonAsync<JsonElement>($"/api/partners/{partner}/reviews");
        listed.GetArrayLength().Should().Be(2, "saving again replaces the user's review");
        var partners = await guest.GetFromJsonAsync<JsonElement>("/api/partners?kind=Lawyer");
        var rated = partners.EnumerateArray().First(p => p.GetProperty("id").GetString() == partner);
        rated.GetProperty("ratingAverage").GetDouble().Should().Be(4.5);
        rated.GetProperty("ratingCount").GetInt32().Should().Be(2);

        (await avi.DeleteAsync($"/api/partners/{partner}/reviews/me")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await guest.GetFromJsonAsync<JsonElement>($"/api/partners/{partner}/reviews")).GetArrayLength().Should().Be(1);
    }
}
