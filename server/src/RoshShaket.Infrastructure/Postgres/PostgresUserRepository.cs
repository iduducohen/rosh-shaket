using Microsoft.EntityFrameworkCore;
using RoshShaket.Application.Auth;

namespace RoshShaket.Infrastructure.Postgres;

public sealed class PostgresUserRepository(RightsDbContext db) : IUserRepository
{
    public async Task<AppUser> SignInAsync(ExternalIdentity identity, DateTimeOffset now, CancellationToken ct)
    {
        var provider = identity.Provider.ToString();
        var link = await db.UserIdentities.Include(i => i.User)
            .FirstOrDefaultAsync(i => i.Provider == provider && i.Subject == identity.Subject, ct);

        UserRow user;
        if (link is not null)
        {
            user = link.User!;
        }
        else
        {
            // Link to an existing account only through an email the provider has verified.
            var email = identity.Email?.Trim().ToLowerInvariant();
            user = (identity.EmailVerified && email is not null
                       ? await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct)
                       : null)
                   ?? db.Users.Add(new UserRow { Id = Guid.NewGuid(), Email = identity.EmailVerified ? email : null, CreatedAt = now, UpdatedAt = now, LastActiveAt = now }).Entity;

            db.UserIdentities.Add(new UserIdentityRow
            {
                Id = Guid.NewGuid(), UserId = user.Id, Provider = provider, Subject = identity.Subject, CreatedAt = now
            });
        }

        user.LastLoginAt = now;
        user.LastActiveAt = now;
        user.UpdatedAt = now;
        if (string.IsNullOrWhiteSpace(user.Name) && !string.IsNullOrWhiteSpace(identity.Name)) user.Name = identity.Name;
        await db.SaveChangesAsync(ct);
        return new AppUser(user.Id, user.Email, user.Name);
    }
}
