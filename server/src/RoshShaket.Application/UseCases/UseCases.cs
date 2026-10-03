using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Billing;
using RoshShaket.Application.Calculation;
using RoshShaket.Application.Documents;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.Rules;
using RoshShaket.Domain;
using RoshShaket.Domain.Content;

namespace RoshShaket.Application.UseCases;

// One class per use case (Single Responsibility). Each depends only on abstractions.

public sealed record CalculateRightsCommand(EmploymentProfile Profile, ExitReason Reason, bool FromPayslip, bool ConsentToAnonymousStats);

public sealed class CalculateRightsHandler(IRightsCalculator calculator, IAnnualValuesProvider values, ICalculationLog log, IClock clock)
{
    public async Task<CalculationResult> HandleAsync(CalculateRightsCommand cmd, CancellationToken ct)
    {
        var annual = await values.GetForDateAsync(cmd.Profile.EndDate, ct);
        var result = calculator.Calculate(new RuleContext(cmd.Profile, cmd.Reason, annual));

        if (cmd.ConsentToAnonymousStats)
        {
            await log.RecordAsync(new AnonymizedCalculation(
                clock.Now, cmd.Reason, (int)Math.Floor(result.Seniority.Years), cmd.Profile.Section14,
                Math.Round(result.EstimatedTotal / 1000m) * 1000m, cmd.FromPayslip), ct);
        }
        return result;
    }
}

/// <summary>Both scenarios for someone still deciding.</summary>
public sealed class CompareScenariosHandler(CalculateRightsHandler inner)
{
    public async Task<IReadOnlyList<CalculationResult>> HandleAsync(EmploymentProfile profile, bool fromPayslip, CancellationToken ct)
    {
        var fired = await inner.HandleAsync(new CalculateRightsCommand(profile, ExitReason.Fired, fromPayslip, false), ct);
        var resigned = await inner.HandleAsync(new CalculateRightsCommand(profile, ExitReason.Resigned, fromPayslip, false), ct);
        return [fired, resigned];
    }
}

public sealed class ExtractPayslipHandler(IPayslipExtractor extractor, PayslipUploadPolicy policy)
{
    public async Task<ProfileDraft> HandleAsync(IReadOnlyList<PayslipImage> images, CancellationToken ct)
    {
        policy.Validate(images);
        var extraction = await extractor.ExtractAsync(images, ct);
        return PayslipMapper.ToDraft(extraction);
    }
}

public sealed class VerifyDocumentHandler(IDocumentVerifier verifier, DocumentVerifyUploadPolicy policy, BillingHandlers billing)
{
    public async Task<DocumentVerificationResult> HandleAsync(
        IReadOnlyList<PayslipImage> images,
        DocumentVerifyRequest request,
        Guid? userId,
        CancellationToken ct)
    {
        var normalized = request with { ExpectedType = ReviewDocumentTypes.Normalize(request.ExpectedType) };
        policy.Validate(images, normalized);

        await billing.ChargeDocumentAsync(userId, normalized.ExpectedType, normalized.ExpectedYear, normalized.ExpectedMonth, ct);
        DocumentExtraction extraction;
        try
        {
            extraction = await verifier.ExtractAsync(images, normalized, ct);
        }
        catch
        {
            // The AI call failed on our side — the user keeps the credit.
            await billing.RefundDocumentAsync(userId, normalized.ExpectedType, normalized.ExpectedYear, normalized.ExpectedMonth, CancellationToken.None);
            throw;
        }

        if (extraction.Usage is { } u)
            await billing.RecordUsageAsync(userId, "document_verify", u.Model, u.InputTokens, u.OutputTokens, CancellationToken.None);
        return DocumentVerificationMapper.Compare(extraction, normalized);
    }
}

public sealed class GetChecklistHandler(IContentRepository content)
{
    public async Task<IReadOnlyList<ChecklistItem>> HandleAsync(ExitReason? reason, CancellationToken ct)
    {
        var all = await content.GetChecklistAsync(ct);
        if (reason is null)
            return all.OrderBy(i => i.Order).ToList();

        var tag = ExitReasonTags.ToTag(reason.Value);
        return all.Where(i => i.AppliesTo(tag)).OrderBy(i => i.Order).ToList();
    }
}

public sealed class GetSourcesHandler(IContentRepository content)
{
    public Task<IReadOnlyList<RightsSource>> HandleAsync(CancellationToken ct) => content.GetSourcesAsync(ct);
}

public sealed class GetPartnersHandler(IPartnerCatalog catalog)
{
    public async Task<IReadOnlyList<PartnerOffer>> HandleAsync(string? kind, CancellationToken ct)
    {
        var all = await catalog.GetAsync(ct);
        var filtered = string.IsNullOrWhiteSpace(kind) ? all : all.Where(p => p.Kind == kind);
        return PartnerRanking.ByPriority(filtered);
    }
}
