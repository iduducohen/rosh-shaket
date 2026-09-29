using System.Net.Mail;
using System.Text.Json;
using RoshShaket.Application.Abstractions;
using RoshShaket.Domain;

namespace RoshShaket.Api.Catalog;

/// <summary>Partner list edited in partners.json. No database, so a name or a discount can change without a migration.</summary>
public sealed class JsonPartnerCatalog(string path, ILogger<JsonPartnerCatalog> log) : IPartnerCatalog
{
    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    public async Task<IReadOnlyList<PartnerOffer>> GetAsync(CancellationToken ct)
    {
        if (!File.Exists(path))
        {
            log.LogInformation("No partner catalog at {Path}", path);
            return [];
        }

        try
        {
            await using var stream = File.OpenRead(path);
            var rows = await JsonSerializer.DeserializeAsync<List<PartnerRow>>(stream, Json, ct) ?? [];
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var offers = new List<PartnerOffer>();
            foreach (var row in rows)
            {
                if (!TryMap(row, out var offer) || !seen.Add(offer.Id)) continue;
                offers.Add(offer);
            }
            return offers;
        }
        catch (Exception ex) when (ex is JsonException or IOException)
        {
            log.LogWarning(ex, "Partner catalog at {Path} could not be read", path);
            return [];
        }
    }

    private static bool TryMap(PartnerRow row, out PartnerOffer offer)
    {
        offer = null!;
        if (string.IsNullOrWhiteSpace(row.Id) || string.IsNullOrWhiteSpace(row.Name)) return false;
        if (row.Kind is not ("Professional" or "Lawyer")) return false;
        if (row.DiscountPercent is < 0 or > 100) return false;
        offer = new PartnerOffer(
            row.Id.Trim(),
            row.Name.Trim(),
            row.Kind,
            (row.Summary ?? "").Trim(),
            row.Cooperation,
            row.DiscountPercent,
            CleanEmail(row.Email),
            CleanWhatsapp(row.Whatsapp));
        return true;
    }

    private static string? CleanEmail(string? value) =>
        !string.IsNullOrWhiteSpace(value) && MailAddress.TryCreate(value.Trim(), out var address) ? address.Address : null;

    private static string? CleanWhatsapp(string? value)
    {
        var digits = new string((value ?? "").Where(char.IsDigit).ToArray());
        if (digits.StartsWith("00", StringComparison.Ordinal)) digits = digits[2..];
        if (digits.StartsWith('0') && digits.Length is >= 9 and <= 10) digits = "972" + digits[1..];
        return digits.Length is >= 9 and <= 15 ? digits : null;
    }

    private sealed class PartnerRow
    {
        public string? Id { get; set; }
        public string? Name { get; set; }
        public string? Kind { get; set; }
        public string? Summary { get; set; }
        public bool Cooperation { get; set; }
        public int DiscountPercent { get; set; }
        public string? Email { get; set; }
        public string? Whatsapp { get; set; }
    }
}
