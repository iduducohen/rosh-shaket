using RoshShaket.Application.Abstractions;

namespace RoshShaket.Infrastructure.Common;

public sealed class SystemClock : IClock
{
    private static readonly TimeZoneInfo Israel = ResolveIsraelTimeZone();
    public DateTimeOffset Now => TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Israel);
    public DateOnly Today => DateOnly.FromDateTime(Now.DateTime);

    private static TimeZoneInfo ResolveIsraelTimeZone()
    {
        foreach (var id in new[] { "Asia/Jerusalem", "Israel Standard Time" })
        {
            if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out var tz)) return tz;
        }
        return TimeZoneInfo.Utc;
    }
}
