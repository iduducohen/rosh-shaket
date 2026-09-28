import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface FileUploadResponse {
  success: boolean;
  filename: string;
  size: number;
  type: string;
  url?: string;
}

@Injectable({ providedIn: 'root' })
export class FileService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  uploadFile(file: File): Observable<FileUploadResponse> {
    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('File type not supported. Only PDF and images (JPEG/PNG) are allowed.');
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('File is too large. Maximum size is 10MB.');
    }

    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<FileUploadResponse>(`${this.baseUrl}/api/files/upload`, formData);
  }

  uploadMultiple(files: File[]): Observable<FileUploadResponse[]> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    return this.http.post<FileUploadResponse[]>(`${this.baseUrl}/api/files/upload-multiple`, formData);
  }

  deleteFile(filename: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/api/files/${filename}`);
  }

  getFileUrl(filename: string): string {
    return `${this.baseUrl}/api/files/${filename}`;
  }

  isPdfFile(file: File): boolean {
    return file.type === 'application/pdf';
  }

  isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
  }
}
