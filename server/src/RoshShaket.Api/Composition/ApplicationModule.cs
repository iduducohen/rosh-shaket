using RoshShaket.Application.Calculation;
using RoshShaket.Application.Payslips;
using RoshShaket.Application.Rules;
using RoshShaket.Application.UseCases;

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

        services.AddScoped<CalculateRightsHandler>();
        services.AddScoped<CompareScenariosHandler>();
        services.AddScoped<ExtractPayslipHandler>();
        services.AddScoped<GetChecklistHandler>();
        services.AddScoped<GetSourcesHandler>();
        return services;
    }
}
