import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import {
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonText,
  IonProgressBar,
  IonChip
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { camera, document as docIcon, close, image } from 'ionicons/icons';
import { FileService } from '../core/file.service';

export interface UploadedFile {
  name: string;
  type: 'image' | 'pdf';
  size: number;
  url?: string;
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonText,
    IonProgressBar,
    IonChip
  ],
  template: `
    <ion-card dir="rtl">
      <ion-card-content>
        <h2>העלאת קבצים</h2>

        <!-- Buttons -->
        <div class="button-group">
          <!-- Camera Button (hidden in browser) -->
          <ion-button
            *ngIf="isNativeApp"
            expand="block"
            color="primary"
            (click)="takeCameraPhoto()">
            <ion-icon slot="start" name="camera"></ion-icon>
            צלם תמונה
          </ion-button>

          <!-- Image Upload Button -->
          <ion-button
            expand="block"
            color="secondary"
            (click)="selectImage()">
            <ion-icon slot="start" name="image"></ion-icon>
            בחר תמונה
          </ion-button>

          <!-- PDF Upload Button -->
          <ion-button
            expand="block"
            color="tertiary"
            (click)="selectPdf()">
            <ion-icon slot="start" name="document"></ion-icon>
            בחר PDF
          </ion-button>
        </div>

        <!-- Hidden File Inputs -->
        <input
          #imageInput
          type="file"
          accept="image/*"
          style="display: none"
          (change)="onImageSelected($event)">

        <input
          #pdfInput
          type="file"
          accept=".pdf,application/pdf"
          style="display: none"
          (change)="onPdfSelected($event)">

        <!-- Upload Progress -->
        <div *ngIf="isUploading" class="progress-container">
          <p>עיבוד הקובץ...</p>
          <ion-progress-bar type="indeterminate"></ion-progress-bar>
        </div>

        <!-- Error Message -->
        <div *ngIf="errorMessage" class="error-message">
          <ion-text color="danger">
            <p>⚠️ {{ errorMessage }}</p>
          </ion-text>
        </div>

        <!-- Uploaded Files -->
        <div *ngIf="uploadedFiles.length > 0" class="files-list">
          <h3>קבצים שהועלו:</h3>
          <ion-chip
            *ngFor="let file of uploadedFiles; let i = index"
            color="primary">
            <span>
              {{ file.type === 'pdf' ? '📄' : '🖼️' }}
              {{ file.name }}
            </span>
            <ion-icon
              name="close"
              (click)="removeFile(i)"
              style="cursor: pointer; margin-right: 8px;">
            </ion-icon>
          </ion-chip>
        </div>
      </ion-card-content>
    </ion-card>
  `,
  styles: [`
    .button-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .progress-container {
      margin: 16px 0;
    }

    .error-message {
      margin: 12px 0;
      padding: 8px;
      background-color: #f8d7da;
      border-radius: 4px;
    }

    .files-list {
      margin-top: 20px;
    }

    .files-list h3 {
      margin-bottom: 12px;
      font-size: 16px;
      font-weight: bold;
    }

    ion-chip {
      margin: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  `]
})
export class FileUploadComponent implements OnInit {
  isNativeApp = Capacitor.isNativePlatform();
  isUploading = false;
  errorMessage = '';
  uploadedFiles: UploadedFile[] = [];

  constructor(private fileService: FileService) {
    addIcons({ camera, docIcon, close, image });
  }

  ngOnInit(): void {
    // Load previously uploaded files from localStorage
    const saved = localStorage.getItem('uploaded_files');
    if (saved) {
      this.uploadedFiles = JSON.parse(saved);
    }
  }

  selectImage(): void {
    const input = document.querySelector('input[accept="image/*"]') as HTMLInputElement;
    input?.click();
  }

  selectPdf(): void {
    const input = document.querySelector('input[accept=".pdf"]') as HTMLInputElement;
    input?.click();
  }

  async takeCameraPhoto(): Promise<void> {
    try {
      this.errorMessage = '';
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera
      });

      // Convert to File and upload
      if (image.webPath) {
        const blob = await fetch(image.webPath).then(r => r.blob());
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        await this.uploadFile(file);
      }
    } catch (error) {
      this.errorMessage = 'נכשל לצלם תמונה. אנא נסה שוב.';
    }
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.uploadFile(input.files[0]);
      input.value = '';
    }
  }

  onPdfSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.uploadFile(input.files[0]);
      input.value = '';
    }
  }

  private uploadFile(file: File): void {
    try {
      this.errorMessage = '';
      this.isUploading = true;

      this.fileService.uploadFile(file).subscribe({
        next: (response) => {
          this.isUploading = false;

          const uploadedFile: UploadedFile = {
            name: response.filename,
            type: this.fileService.isPdfFile(file) ? 'pdf' : 'image',
            size: response.size,
            url: response.url
          };

          this.uploadedFiles.push(uploadedFile);
          this.saveToLocalStorage();
        },
        error: (error) => {
          this.isUploading = false;
          this.errorMessage = error.message || 'שגיאה בהעלאת הקובץ. אנא נסה שוב.';
        }
      });
    } catch (error: any) {
      this.isUploading = false;
      this.errorMessage = error.message || 'שגיאה בהעלאת הקובץ';
    }
  }

  removeFile(index: number): void {
    const file = this.uploadedFiles[index];
    this.uploadedFiles.splice(index, 1);
    this.saveToLocalStorage();

    // Optionally delete from server
    if (file.name) {
      this.fileService.deleteFile(file.name).subscribe({
        error: () => console.error('Failed to delete file from server')
      });
    }
  }

  private saveToLocalStorage(): void {
    localStorage.setItem('uploaded_files', JSON.stringify(this.uploadedFiles));
  }
}
