using System.Globalization;

namespace RoshShaket.Application.Rules;

internal static class Format
{
    private static readonly CultureInfo Culture = CultureInfo.InvariantCulture;
    public static string Ils(decimal amount) => "₪" + Math.Round(amount, 0, MidpointRounding.AwayFromZero).ToString("N0", Culture);
    public static string Num(decimal value, int decimals = 2) => Math.Round(value, decimals).ToString("0.##", Culture);
}
