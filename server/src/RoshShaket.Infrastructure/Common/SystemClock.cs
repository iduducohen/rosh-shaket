using RoshShaket.Application.Abstractions;

namespace RoshShaket.Infrastructure.Common;

public sealed class SystemClock : IClock
{
    private static readonly TimeZoneInfo Israel = ResolveIsraelTimeZone();
    public DateTimeOffset Now => DateTimeOffset.UtcNow;
    public DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Israel).DateTime);

    private static TimeZoneInfo ResolveIsraelTimeZone()
    {
        foreach (var id in new[] { "Asia/Jerusalem", "Israel Standard Time" })
        {
            if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out var tz)) return tz;
        }
        return TimeZoneInfo.Utc;
    }
}
