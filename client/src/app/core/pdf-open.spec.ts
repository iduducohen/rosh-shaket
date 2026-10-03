import { PdfLockedError, PdfUnlocker, openPdf } from './pdf-open';

/** A one-page PDF encrypted (AES-256) with the password 123456789, as a payslip often is (an ID number). */
const LOCKED_PDF = 'JVBERi0xLjcKJb/3ov4KMSAwIG9iago8PCAvRXh0ZW5zaW9ucyA8PCAvQURCRSA8PCAvQmFzZVZlcnNpb24gLzEuNyAvRXh0ZW5zaW9uTGV2ZWwgOCA+PiA+PiAvUGFnZXMgMiAwIFIgL1R5cGUgL0NhdGFsb2cgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcyA+PgplbmRvYmoKMyAwIG9iago8PCAvQ29udGVudHMgNCAwIFIgL01lZGlhQm94IFsgMCAwIDIwMCAxMDAgXSAvUGFyZW50IDIgMCBSIC9SZXNvdXJjZXMgPDwgL0ZvbnQgPDwgL0YxIDUgMCBSID4+ID4+IC9UeXBlIC9QYWdlID4+CmVuZG9iago0IDAgb2JqCjw8IC9MZW5ndGggODAgL0ZpbHRlciAvRmxhdGVEZWNvZGUgPj4Kc3RyZWFtCjx0CPWPx68Zg4SjYdNR5agGDbLkhsuA23kFvWA2oFtpFugtYJVg0jehMUQHXGJ45s0AmJqyTDZ8+mU2nu5/uKsTP3NUpGyXwCYVr9CjzQixZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8IC9CYXNlRm9udCAvSGVsdmV0aWNhIC9TdWJ0eXBlIC9UeXBlMSAvVHlwZSAvRm9udCA+PgplbmRvYmoKNiAwIG9iago8PCAvQ0YgPDwgL1N0ZENGIDw8IC9BdXRoRXZlbnQgL0RvY09wZW4gL0NGTSAvQUVTVjMgL0xlbmd0aCAzMiA+PiA+PiAvRmlsdGVyIC9TdGFuZGFyZCAvTGVuZ3RoIDI1NiAvTyA8NmViYTFjNDkzYmRjYzIxNjQ3NThkYzBkZDllNjJhZDEwOTBlNWQxN2U0NjI3MTM3NzUxY2VhMTcyYzcwMzVlMTYwMzFiZjY3YjVjODc4ZGJhNjJhZjNmMDA5NDYzMjJmPiAvT0UgPDNlYzA4OTZhYjhhOWNlYmVlNzE4NjE5NjgwOWNmNDZiMTUxN2E3MGZiM2ExNDA2ZTZkNDE1NzZlMDZlNzkyNTQ+IC9QIC00IC9QZXJtcyA8YjgzNjk0NTYwMTEwNjZiNmM3YzJlMWI5ZTM3MzcwYjA+IC9SIDYgL1N0bUYgL1N0ZENGIC9TdHJGIC9TdGRDRiAvVSA8Mzk4MDlkNDA3ZjU0ODI3NmZiZjkyNWNmMmRkNjc2NzNhMTllYzVkNTk0NGYwNDUwNWNlNjBkMTlhMzJmZWQ3OTcyOWU1YzU3NWUzZDAxNjdhNDk3YTc0YTliZTQ4ZDA0PiAvVUUgPDRiNTg3ZDhkNzMzMzgzNThlYzVkNDY3NWZiYWI0ODMxOTJmZTFkZDMwYzI1ODZiZTFiZDY5NzdkYWFhMDgyMjY+IC9WIDUgPj4KZW5kb2JqCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMTMwIDAwMDAwIG4gCjAwMDAwMDAxODkgMDAwMDAgbiAKMDAwMDAwMDMxNyAwMDAwMCBuIAowMDAwMDAwNDY3IDAwMDAwIG4gCjAwMDAwMDA1MzcgMDAwMDAgbiAKdHJhaWxlciA8PCAvUm9vdCAxIDAgUiAvSUQgWzwxNWNiNjhhNGYyZWI0NjY3ZTE1ZWRlZWM5YTQ1MGUzOT48MTVjYjY4YTRmMmViNDY2N2UxNWVkZWVjOWE0NTBlMzk+XSAvRW5jcnlwdCA2IDAgUiA+PgpzdGFydHhyZWYKMTA4NAolJUVPRgo=';

function lockedFile(): File {
  const bytes = Uint8Array.from(atob(LOCKED_PDF), c => c.charCodeAt(0));
  return new File([bytes], 'payslip-12-2023.pdf', { type: 'application/pdf' });
}

function unlocker(saved: string[], answers: Array<string | null>): PdfUnlocker & { asked: Array<[boolean, boolean]>; kept: string[] } {
  const asked: Array<[boolean, boolean]> = [];
  const kept: string[] = [];
  return {
    asked, kept,
    known: () => saved,
    ask: (_name, wrong, triedSaved) => { asked.push([wrong, triedSaved]); return Promise.resolve(answers.shift() ?? null); },
    remember: password => { kept.push(password); }
  };
}

describe('openPdf with a password-protected PDF', () => {
  it('opens with a saved password without asking', async () => {
    const u = unlocker(['000000000', '123456789'], []);
    const pdf = await openPdf(lockedFile(), u);
    expect(pdf.numPages).toBe(1);
    expect(u.asked).toEqual([]);
    expect(u.kept).toEqual([], 'nothing new to keep');
    await pdf.destroy();
  });

  it('asks once, then remembers the password that worked', async () => {
    const u = unlocker([], ['123456789']);
    const pdf = await openPdf(lockedFile(), u);
    expect(u.asked).toEqual([[false, false]]);
    expect(u.kept).toEqual(['123456789']);
    await pdf.destroy();
  });

  it('says the file has a different password when the saved ones do not fit, and retries a wrong entry', async () => {
    const u = unlocker(['111111111'], ['bad', '123456789']);
    const pdf = await openPdf(lockedFile(), u);
    expect(u.asked).toEqual([[false, true], [true, true]]);
    expect(u.kept).toEqual(['123456789']);
    await pdf.destroy();
  });

  it('reports a locked file when the user cancels', async () => {
    await expectAsync(openPdf(lockedFile(), unlocker([], [null]))).toBeRejectedWithError(PdfLockedError);
  });
});
