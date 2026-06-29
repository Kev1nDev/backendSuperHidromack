import os
import json
import cloudinary
import cloudinary.uploader
from pathlib import Path

# Configuracion
cloudinary.config(
    cloud_name="do3kjbiy8",
    api_key="996285372526885",
    api_secret="GlgV-gGajJA15QrxxA3FnEF_ctY",
    secure=True
)

# Rutas
BASE_DIR = Path(r"C:\Users\insan\Desktop\SuperHidroMack\src\assets")
OUTPUT_JSON = Path(r"C:\Users\insan\Desktop\backend SuperHidromack\image-mapping.json")

ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.svg'}

def upload_file(file_path):
    """Sube un archivo a Cloudinary y retorna resultado."""
    relative = file_path.relative_to(BASE_DIR)
    folder = f"superhidromack/assets/{relative.parent.as_posix()}"
    file_name = file_path.stem
    ext = file_path.suffix.lower()

    try:
        result = cloudinary.uploader.upload(
            str(file_path),
            folder=folder,
            public_id=file_name,
            overwrite=False,
            resource_type="image" if ext != '.svg' else "raw",
            use_filename=True,
            unique_filename=False,
        )
        return {
            "success": True,
            "url": result["secure_url"],
            "public_id": result["public_id"],
            "file": relative.as_posix(),
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "file": relative.as_posix(),
        }

def main():
    results = []
    mapping = {}

    print("Escaneando: {}".format(BASE_DIR))
    print("")

    # Recorrer recursivamente
    for file_path in BASE_DIR.rglob("*"):
        if file_path.is_file() and file_path.suffix.lower() in ALLOWED_EXTENSIONS:
            print("Subiendo: {}...".format(file_path.name))
            result = upload_file(file_path)
            results.append(result)
            if result["success"]:
                print("  OK: {}".format(result['url']))
                mapping[result["file"]] = {
                    "url": result["url"],
                    "public_id": result["public_id"],
                }
            else:
                print("  ERROR: {}".format(result['error']))

    # Guardar JSON
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)

    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    print("")
    print("=" * 40)
    print("Total: {}".format(len(results)))
    print("Exitosas: {}".format(len(successful)))
    print("Fallidas: {}".format(len(failed)))
    print("=" * 40)
    print("")
    print("Mapping guardado en: {}".format(OUTPUT_JSON))

    if failed:
        print("")
        print("Archivos fallidos:")
        for f in failed:
            print("  - {}: {}".format(f['file'], f['error']))

if __name__ == "__main__":
    main()
