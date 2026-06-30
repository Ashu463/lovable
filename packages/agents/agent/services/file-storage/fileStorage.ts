// fileStorage.ts
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { s3Client, BUCKET_NAME } from "./s3Client";

export class R2{
    // key here is the path of the file in which you have to make the edits.
    async putFile(key: string, content: string) {
      await s3Client.send(new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: content,
        })
      );
    }
    
    async getFile(key: string): Promise<string> {
      const res = await s3Client.send(
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        })
      );
      return await res.Body!.transformToString();
    }
    
    // Delete a file
    async deleteFile(key: string) {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        })
      );
    }
    
    // List all keys under a prefix (e.g. a project's folder)
    async listFiles(prefix: string): Promise<string[]> {
      const res = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
        })
      );
      return (res.Contents ?? []).map((obj) => obj.Key!);
    }

}



// const filesPrefix = (userId: string, projectId: string) =>
//   `users/${userId}/projects/${projectId}/files/`;

// const manifestKey = (userId: string, projectId: string) =>
//   `users/${userId}/projects/${projectId}/manifest.json`;

// // usage example:
// await putFile(`users/u1/projects/p1/files/src/App.tsx`, fileContent);
// await putFile(manifestKey("u1", "p1"), JSON.stringify(manifest));
// const allKeys = await listFiles(filesPrefix("u1", "p1"));