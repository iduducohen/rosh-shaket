namespace RoshShaket.Domain;

/// <summary>Why the employment ends. Drives almost every entitlement.</summary>
public enum ExitReason
{
    Fired,
    ResignedJustified,   // "התפטרות בדין מפוטר"
    Resigned,
    ContractEnded
}

/// <summary>Section 14 arrangement of the Severance Pay Law, as stated by the employee or read from a payslip.</summary>
public enum Section14Arrangement
{
    Full,      // 8.33% deposited, replaces severance
    Partial6,  // 6% deposited, employer tops up the rest
    None,
    Unknown
}

public enum WorkWeek
{
    FiveDays = 5,
    SixDays = 6
}

public enum PayType
{
    Monthly,
    Hourly
}

public enum Certainty
{
    Estimate,           // computed by law for a standard employee
    NeedsVerification,  // depends on something the user should check (contract, section 14)
    Informational       // not money the employer pays at exit
}
