import os
import shutil

# CHANGE THIS to your root directory
ROOT_DIR = r"/run/user/1000/gvfs/dav:host=revamp.kivitendo.ch,ssl=true,prefix=%2Fedit/shopbilder"

def is_numeric_folder(name):
    return name.isdigit()

def correct_name(name):
    return name.zfill(6)

def move_contents(src, dst):
    for item in os.listdir(src):
        src_path = os.path.join(src, item)
        dst_path = os.path.join(dst, item)

        # If file already exists in destination, avoid overwrite
        if os.path.exists(dst_path):
            print(f"WARNING: {dst_path} already exists. Skipping {src_path}")
            continue

        shutil.move(src_path, dst_path)
        print(f"Moved: {src_path} → {dst_path}")

def main():
    for folder in os.listdir(ROOT_DIR):
        folder_path = os.path.join(ROOT_DIR, folder)

        if not os.path.isdir(folder_path):
            continue

        if not is_numeric_folder(folder):
            continue

        if len(folder) == 6:
            continue  # Already correct

        correct_folder_name = correct_name(folder)
        correct_folder_path = os.path.join(ROOT_DIR, correct_folder_name)

        print(f"Processing: {folder} → {correct_folder_name}")

        # Create correct folder if it doesn't exist
        if not os.path.exists(correct_folder_path):
            os.makedirs(correct_folder_path)
            print(f"Created folder: {correct_folder_path}")

        # Move files
        move_contents(folder_path, correct_folder_path)

        # Remove old folder if empty
        if not os.listdir(folder_path):
            os.rmdir(folder_path)
            print(f"Deleted empty folder: {folder_path}")
        else:
            print(f"Folder not empty, not deleted: {folder_path}")

if __name__ == "__main__":
    main()
