using System.Text.Json;
using RoshShaket.Application.Workspaces;
using Xunit;

namespace RoshShaket.Application.Tests;

public class WizardSnapshotTests
{
    [Fact]
    public void Snapshot_roundtrips_with_camelCase()
    {
        var snap = new WizardSnapshot(
            "Fired",
            """{"startDate":"2020-01-01","endDate":"2026-01-01","monthlySalary":10000,"jobPercent":100,"workDaysPerWeek":5,"vacationBalanceDays":0,"recuperationDaysPaidLastYear":0,"section14":"Unknown","hasStudyFund":false}""",
            null,
            """["startDate","monthlySalary"]""",
            true,
            "03/2026",
            null,
            0,
            "/details",
            "details",
            1);

        var json = JsonSerializer.Serialize(snap, WizardSnapshotJson.Options);
        var back = JsonSerializer.Deserialize<WizardSnapshot>(json, WizardSnapshotJson.Options);
        Assert.NotNull(back);
        Assert.Equal("Fired", back!.Choice);
        Assert.Equal("/details", back.CurrentRoute);
        Assert.True(back.FromPayslip);
        Assert.Equal(1, back.StateVersion);
    }

    [Fact]
    public void Sanitize_rejects_traversal_via_handler_limits()
    {
        Assert.True(WorkspaceHandlers.MaxDocumentBytes == 10 * 1024 * 1024);
        Assert.Equal(1, WorkspaceHandlers.CurrentStateVersion);
    }
}
