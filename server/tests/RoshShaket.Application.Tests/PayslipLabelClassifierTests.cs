using RoshShaket.Application.Documents;
using Xunit;

namespace RoshShaket.Application.Tests;

public class PayslipLabelClassifierTests
{
    [Theory]
    [InlineData("ניכוי כלל פנס", "employee", "pension")]
    [InlineData("ניכוי מגדל ביט", "employee", "managers")]
    [InlineData("ניכוי מור קה\"ש", "employee", "study")]
    [InlineData("הפרשת פיצ כלל", "employer", "severance")]
    [InlineData("הפרשת פיצ מגד", "employer", "severance")]
    [InlineData("הפרשה אוב מגד", "employer", "disability")]
    [InlineData("הפרשת כלל פנס", "employer", "pension")]
    [InlineData("הפרשה מור קה", "employer", "study")]
    public void The_printed_name_says_who_pays_and_what_for(string label, string payer, string kind)
    {
        Assert.Equal(payer, PayslipLabelClassifier.PayerOf(label));
        Assert.Equal(kind, PayslipLabelClassifier.KindOf(label));
    }

    [Theory]
    [InlineData("הפרשה מגדל בי")]
    [InlineData("")]
    [InlineData(null)]
    public void A_cut_short_or_missing_name_leaves_the_kind_to_the_reading(string? label)
    {
        Assert.Null(PayslipLabelClassifier.KindOf(label));
    }

    [Theory]
    [InlineData("מס הכנסה")]
    [InlineData("פיצויים")]
    [InlineData(null)]
    public void A_name_that_is_neither_a_deduction_nor_a_deposit_has_no_payer(string? label)
    {
        Assert.Null(PayslipLabelClassifier.PayerOf(label));
    }
}
