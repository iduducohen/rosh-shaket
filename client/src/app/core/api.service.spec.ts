import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { ChecklistItem, ExitReason, RightsSource } from './models';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ApiService]
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call checklist endpoint', async () => {
    const mockData: ChecklistItem[] = [{
      key: 'payslip', group: 'לפני', order: 1, text: 'לבקש תלוש', tags: [], sourceKey: null
    }];
    const reason: ExitReason = 'Fired';
    const promise = service.checklist(reason);

    const req = httpMock.expectOne((request) => request.url.includes('/api/checklist'));
    expect(req.request.method).toBe('GET');
    req.flush(mockData);

    const result = await promise;
    expect(result).toEqual(mockData);
  });

  it('should call sources endpoint', async () => {
    const mockData: RightsSource[] = [{
      key: 'kolzchut', title: 'כל-זכות', url: 'https://www.kolzchut.org.il', description: 'מקור'
    }];
    const promise = service.sources();

    const req = httpMock.expectOne((request) => request.url.includes('/api/sources'));
    expect(req.request.method).toBe('GET');
    req.flush(mockData);

    const result = await promise;
    expect(result).toEqual(mockData);
  });
});
