using RoshShaket.Application.Abstractions;
using RoshShaket.Application.Auth;
using RoshShaket.Application.Calculation;
using RoshShaket.Application.Documents;
using RoshShaket.Application.EmploymentReview;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.Reports;
using RoshShaket.Application.Rules;
using RoshShaket.Application.Rules.Contribution;
using RoshShaket.Application.UseCases;
using RoshShaket.Application.Workspaces;

namespace RoshShaket.Api.Composition;

/// <summary>Composition root for the application layer. Adding a right = one more line here plus one new rule class.</summary>
public static class ApplicationModule
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddSingleton<IRightsRule, SeveranceRule>();
        services.AddSingleton<IRightsRule, NoticePeriodRule>();
        services.AddSingleton<IRightsRule, VacationRedemptionRule>();
        services.AddSingleton<IRightsRule, RecuperationRule>();
        services.AddSingleton<IRightsRule, PensionFundsRule>();

        services.AddSingleton<IAdvisoryRule, ExitReasonAdvisoryRule>();
        services.AddSingleton<IAdvisoryRule, PayTypeAdvisoryRule>();

        services.AddSingleton<IRightsCalculator, RightsCalculator>();
        services.AddSingleton<PayslipUploadPolicy>();
        services.AddSingleton<DocumentVerifyUploadPolicy>();

        services.AddScoped<CalculateRightsHandler>();
        services.AddScoped<CompareScenariosHandler>();
        services.AddScoped<BuildReportHandler>();
        services.AddScoped<ExtractPayslipHandler>();
        services.AddScoped<VerifyDocumentHandler>();
        services.AddScoped<RoshShaket.Application.Billing.BillingHandlers>();
        services.AddScoped<GetChecklistHandler>();
        services.AddScoped<GetSourcesHandler>();
        services.AddScoped<GetPartnersHandler>();
        services.AddScoped<ExternalSignInHandler>();
        services.AddScoped<EmailCodeSignInHandler>();
        services.AddScoped<AccountLinkingHandler>();
        services.AddScoped<WorkspaceHandlers>();
        services.AddSingleton<ContributionRulesEngine>();
        services.AddScoped<EmploymentReviewHandlers>();
        services.AddSingleton<ReconciliationReportBuilder>();
        return services;
    }
}
