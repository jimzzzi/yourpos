import { api } from "../api/client";

export async function uploadImage(file, onProgress) {
  const formData = new FormData();
  formData.append("image", {
    uri: file.uri,
    name: file.name || "image.jpg",
    type: file.type || "image/jpeg",
  });

  try {
    const response = await api.post("/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percent);
        }
      },
    });
    return response.data; // { url: "https://...", public_id: "..." }
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