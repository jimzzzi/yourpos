import { api } from "../api/client";
import { Platform } from "react-native";

export async function uploadImage(file, onProgress) {
  const formData = new FormData();
  
  const isWebFile = Platform.OS === "web" && file instanceof File;
  
  if (isWebFile) {
    formData.append("image", file, file.name || "image.jpg");
  } else {
    formData.append("image", {
      uri: file.uri,
      name: file.name || "image.jpg",
      type: file.type || "image/jpeg",
    });
  }

  try {
    const response = await api.post("/upload/image", formData, {
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return response.data;
  } catch (error) {
    console.error("Upload failed:", error);
    throw new Error(error.response?.data?.error || "Upload failed");
  }
}

export async function deleteImage(publicId) {
  try {
    await api.delete("/upload/image", { data: { public_id: publicId } });
    return true;
  } catch (error) {
    console.error("Delete failed:", error);
    return false;
  }
}