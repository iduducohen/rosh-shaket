namespace RoshShaket.Application.Documents;

/// <summary>
/// Classifies a contribution row of a payslip from the name it is printed with: "ניכוי כלל פנס" is the employee's deduction
/// to a pension fund, "הפרשת פיצ מגד" is the employer's severance deposit. A row name says who pays and what for far more
/// reliably than reading the table's columns, so the name decides whenever it says something.
/// </summary>
public static class PayslipLabelClassifier
{
    /// <summary>Payer: "employee" for a deduction, "employer" for a deposit, or null when the name says nothing.</summary>
    public static string? PayerOf(string? label)
    {
        var words = Words(label);
        if (words.Length == 0) return null;
        var first = words[0];
        if (first.StartsWith("ניכוי", StringComparison.Ordinal)) return "employee";
        if (first.StartsWith("הפרשה", StringComparison.Ordinal) || first.StartsWith("הפרשת", StringComparison.Ordinal)
            || first.StartsWith("הפרשות", StringComparison.Ordinal)) return "employer";
        return null;
    }

    /// <summary>
    /// Kind: severance | disability | study | managers | pension, or null when the name does not say. A cut-short name
    /// ("הפרשה מגדל בי") says nothing about the kind, and the reading's own choice stands.
    /// </summary>
    public static string? KindOf(string? label)
    {
        var text = string.Join(' ', Words(label));
        if (text.Length == 0) return null;
        if (text.Contains("פיצ", StringComparison.Ordinal)) return "severance";
        if (text.Contains("אוב", StringComparison.Ordinal) || text.Contains("אכע", StringComparison.Ordinal)
            || text.Contains("אובדן", StringComparison.Ordinal)) return "disability";
        if (text.Contains("קהש", StringComparison.Ordinal) || text.Contains("קהג", StringComparison.Ordinal)
            || text.Contains("השתל", StringComparison.Ordinal) || text.Contains("קה ", StringComparison.Ordinal)
            || text.EndsWith(" קה", StringComparison.Ordinal)) return "study";
        if (text.Contains("ביט", StringComparison.Ordinal) || text.Contains("מנהלים", StringComparison.Ordinal)) return "managers";
        if (text.Contains("פנס", StringComparison.Ordinal) || text.Contains("תגמ", StringComparison.Ordinal)
            || text.Contains("גמל", StringComparison.Ordinal)) return "pension";
        return null;
    }

    /// <summary>The words of a label, without quotes and punctuation inside words, so "קה"ש" and "קהש" are the same.</summary>
    private static string[] Words(string? label)
    {
        if (string.IsNullOrWhiteSpace(label)) return [];
        var cleaned = new string(label.Where(c => c is not ('"' or '\'' or '״' or '׳' or '.' or '“' or '”')).ToArray());
        return cleaned.Split([' ', '\t', '-', '–', ':', ','], StringSplitOptions.RemoveEmptyEntries);
    }
}
