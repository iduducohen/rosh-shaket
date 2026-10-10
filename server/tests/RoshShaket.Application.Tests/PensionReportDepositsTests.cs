using RoshShaket.Application.Documents;
using Xunit;

namespace RoshShaket.Application.Tests;

/// <summary>A pension report carries the deposits by salary month, and may cover more than one year.</summary>
public class PensionReportDepositsTests
{
    private static ExtractedContributionLine Deposit(int year, int month, string payer, decimal amount, string kind = "pension") =>
        new(kind, payer, "מגדל", null, amount, year, month);

    [Fact]
    public void Report_dated_later_is_accepted_for_a_year_it_has_deposits_for()
    {
        var extraction = new DocumentExtraction(true, "pension_report", 2025, null, null, null,
            Contributions: [Deposit(2024, 3, "employee", 600m), Deposit(2024, 3, "employer", 650m)]);

        var result = DocumentVerificationMapper.Compare(extraction, new DocumentVerifyRequest("pension_report", 2024, null));

        Assert.True(result.YearMatches);
        Assert.True(result.OverallOk);
        Assert.Contains("2 שורות הפקדה", result.MessageHe);
        Assert.Equal(2, result.Contributions!.Count);
    }

    [Fact]
    public void Report_without_deposits_for_the_year_and_another_report_year_is_rejected()
    {
        var extraction = new DocumentExtraction(true, "pension_report", 2025, null, null, null,
            Contributions: [Deposit(2025, 3, "employee", 600m)]);

        var result = DocumentVerificationMapper.Compare(extraction, new DocumentVerifyRequest("pension_report", 2023, null));

        Assert.False(result.YearMatches);
        Assert.False(result.OverallOk);
    }

    [Fact]
    public void Report_year_still_matches_without_any_deposit_lines_and_says_it_cannot_be_compared()
    {
        var extraction = new DocumentExtraction(true, "pension_report", 2024, null, null, null);

        var result = DocumentVerificationMapper.Compare(extraction, new DocumentVerifyRequest("pension_report", 2024, null));

        Assert.True(result.OverallOk);
        Assert.Contains("אי אפשר להשוות", result.MessageHe);
    }

    [Fact]
    public void Payslip_year_rule_is_unchanged_by_deposit_lines()
    {
        var extraction = new DocumentExtraction(true, "payslip", 2025, 3, null, null,
            Contributions: [Deposit(2024, 3, "employee", 600m)]);

        var result = DocumentVerificationMapper.Compare(extraction, new DocumentVerifyRequest("payslip", 2024, 3));

        Assert.False(result.YearMatches);
    }
}
