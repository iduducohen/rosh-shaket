namespace RoshShaket.Domain;

/// <summary>Values that change by year. Stored in the database with a validity date, never hard-coded in rules.</summary>
public sealed record AnnualValues(
    DateOnly ValidFrom,
    decimal RecuperationDayValue,
    decimal SeveranceTaxExemptCapPerYear,
    decimal FullSeveranceRatePercent = 8.33m);
