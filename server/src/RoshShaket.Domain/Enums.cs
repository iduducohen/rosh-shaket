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
    OneDay = 1,
    TwoDays = 2,
    ThreeDays = 3,
    FourDays = 4,
    FiveDays = 5,
    SixDays = 6
}

public enum PayType
{
    Monthly,
    Hourly,
    /// <summary>
    /// A monthly salary with a fixed "global overtime" component. The rights follow the monthly rules,
    /// and the component stays out of the base salary they are computed on.
    /// </summary>
    Global
}

public enum Certainty
{
    Estimate,           // computed by law for a standard employee
    NeedsVerification,  // depends on something the user should check (contract, section 14)
    Informational       // not money the employer pays at exit
}
