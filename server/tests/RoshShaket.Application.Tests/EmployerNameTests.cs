using RoshShaket.Application.Documents;
using RoshShaket.Application.Payslips;
using Xunit;

namespace RoshShaket.Application.Tests;

/// <summary>The employer name read from a payslip reaches the client, so the form no longer asks for it.</summary>
public class EmployerNameTests
{
    [Fact]
    public void Quick_check_draft_carries_the_employer_from_the_payslip()
    {
        var extraction = new PayslipExtraction(true, "2023-12", null, 12000m, 100m, 5, null, null, null, null,
            EmployerName: "חברת דוגמה בע\"מ");

        Assert.Equal("חברת דוגמה בע\"מ", PayslipMapper.ToDraft(extraction).EmployerName);
    }

    [Fact]
    public void Document_check_result_carries_the_employer()
    {
        var extraction = new DocumentExtraction(true, "payslip", 2023, 12, null, null, EmployerName: "חברת דוגמה בע\"מ");

        var result = DocumentVerificationMapper.Compare(extraction, new DocumentVerifyRequest("payslip", 2023, 12));

        Assert.True(result.OverallOk);
        Assert.Equal("חברת דוגמה בע\"מ", result.EmployerName);
    }
}
