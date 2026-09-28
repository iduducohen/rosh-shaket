import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { ExitReason } from './models';

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
    const mockData = [{ id: 1, title: 'Test Item' }];
    const promise = service.checklist(ExitReason.Fired);

    const req = httpMock.expectOne((request) => request.url.includes('/api/checklist'));
    expect(req.request.method).toBe('GET');
    req.flush(mockData);

    const result = await promise;
    expect(result).toEqual(mockData);
  });

  it('should call sources endpoint', async () => {
    const mockData = [{ id: 1, name: 'Source 1' }];
    const promise = service.sources();

    const req = httpMock.expectOne((request) => request.url.includes('/api/sources'));
    expect(req.request.method).toBe('GET');
    req.flush(mockData);

    const result = await promise;
    expect(result).toEqual(mockData);
  });
});
