import os
import shutil

# === CONFIGURE THIS ===
ROOT_DIR = r"/home/dani/backup-mediator/backup/backend/media"
OUTPUT_DIR = r"/home/dani/backup-mediator/backup/backend/shopbilder"
# ======================

VALID_EXTENSIONS = (".jpg", ".jpeg", ".png")

def get_image_files(folder_path):
    return [
        f for f in os.listdir(folder_path)
        if f.lower().endswith(VALID_EXTENSIONS)
        and os.path.isfile(os.path.join(folder_path, f))
    ]

def extract_prefix(filename):
    return filename.split("-")[0]

for folder_name in os.listdir(ROOT_DIR):
    folder_path = os.path.join(ROOT_DIR, folder_name)

    if not os.path.isdir(folder_path):
        continue

    if not folder_name.startswith("I-"):
        continue

    image_files = get_image_files(folder_path)

    if not image_files:
        print(f"Skipping '{folder_name}' (no images found)")
        continue

    prefixes = {extract_prefix(f) for f in image_files}

    if len(prefixes) != 1:
        print(f"Skipping '{folder_name}' (multiple prefixes found: {prefixes})")
        continue

    raw_prefix = prefixes.pop()

    if not raw_prefix.isdigit():
        print(f"Skipping '{folder_name}' (prefix is not numeric: '{raw_prefix}')")
        continue

    padded_prefix = raw_prefix.zfill(6)
    new_folder_path = os.path.join(OUTPUT_DIR, padded_prefix)

    os.makedirs(new_folder_path, exist_ok=True)

    for image in image_files:
        src = os.path.join(folder_path, image)
        dst = os.path.join(new_folder_path, image)

        if os.path.exists(dst):
            print(f"Skipping copy (already exists): {dst}")
            continue

        shutil.copy2(src, dst)

    print(f"Copied images from '{folder_name}' → '{padded_prefix}'")

print("Done.")