using Microsoft.EntityFrameworkCore;
using RoshShaket.Application.Auth;
using RoshShaket.Application.Workspaces;

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

    public async Task<IReadOnlyList<LinkedIdentity>> ListIdentitiesAsync(Guid userId, CancellationToken ct)
    {
        var rows = await db.UserIdentities.AsNoTracking()
            .Where(i => i.UserId == userId)
            .OrderBy(i => i.CreatedAt)
            .ToListAsync(ct);

        return rows
            .Select(i => new LinkedIdentity(
                Enum.TryParse<AuthProvider>(i.Provider, out var p) ? p : AuthProvider.Email,
                i.CreatedAt))
            .ToList();
    }

    public async Task LinkAsync(Guid userId, ExternalIdentity identity, DateTimeOffset now, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new NotFoundException("המשתמש לא נמצא.");

        var provider = identity.Provider.ToString();
        var existing = await db.UserIdentities
            .FirstOrDefaultAsync(i => i.Provider == provider && i.Subject == identity.Subject, ct);

        if (existing is not null)
        {
            if (existing.UserId != userId)
                throw new AuthenticationFailedException("שיטת ההתחברות הזו כבר מחוברת לחשבון אחר.");
            return; // already linked to this user
        }

        // Same provider already on this account with a different subject — replace is not allowed silently.
        if (await db.UserIdentities.AnyAsync(i => i.UserId == userId && i.Provider == provider, ct))
            throw new AuthenticationFailedException("כבר מחוברת התחברות עם הספק הזה. נתקו אותה לפני חיבור מחדש.");

        db.UserIdentities.Add(new UserIdentityRow
        {
            Id = Guid.NewGuid(), UserId = userId, Provider = provider, Subject = identity.Subject, CreatedAt = now
        });

        if (identity.EmailVerified && !string.IsNullOrWhiteSpace(identity.Email) && string.IsNullOrWhiteSpace(user.Email))
            user.Email = identity.Email.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(user.Name) && !string.IsNullOrWhiteSpace(identity.Name))
            user.Name = identity.Name;
        user.UpdatedAt = now;
        await db.SaveChangesAsync(ct);
    }

    public async Task UnlinkAsync(Guid userId, AuthProvider provider, CancellationToken ct)
    {
        var links = await db.UserIdentities.Where(i => i.UserId == userId).ToListAsync(ct);
        if (links.Count == 0)
            throw new NotFoundException("לא נמצאו שיטות התחברות.");

        var target = links.Where(i => string.Equals(i.Provider, provider.ToString(), StringComparison.OrdinalIgnoreCase)).ToList();
        if (target.Count == 0)
            throw new NotFoundException("שיטת ההתחברות לא מחוברת לחשבון.");

        if (links.Count - target.Count < 1)
            throw new AuthenticationFailedException("לא ניתן לנתק את שיטת ההתחברות האחרונה. חברו שיטה נוספת קודם.");

        db.UserIdentities.RemoveRange(target);
        await db.SaveChangesAsync(ct);
    }
}
