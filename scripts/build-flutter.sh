SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR/flutter"

echo "Creating Flutter example platform folders..."
cd example
flutter create --platforms=ios,android .

echo "Setting iOS minimum version to 13.0..."
if [ -f "ios/Podfile" ]; then
    sed -i '' "s/# platform :ios, '12.0'/platform :ios, '13.0'/" ios/Podfile
    echo "Updated Podfile to use iOS 13.0"
else
    echo "Warning: ios/Podfile not found"
fi

if [ -f "ios/Runner.xcodeproj/project.pbxproj" ]; then
    # Set iOS deployment target to 13.0 in Xcode project
    sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]*;/IPHONEOS_DEPLOYMENT_TARGET = 13.0;/g' ios/Runner.xcodeproj/project.pbxproj
    echo "Updated Xcode project iOS deployment target to 13.0"
else
    echo "Warning: Xcode project file not found"
fi

cd ..

echo "Copying iOS frameworks to Flutter project..."
rm -rf ios/cactus.xcframework
cp -R "$ROOT_DIR/ios"/cactus.xcframework ios/

echo "Zipping JNILibs and XCFramework..."

JNI_LIBS_SOURCE_DIR="android/src/main/jniLibs"
JNI_LIBS_ZIP_TARGET="android/jniLibs.zip"

XCFRAMEWORK_SOURCE_DIR="ios/cactus.xcframework" 
XCFRAMEWORK_ZIP_TARGET="ios/cactus.xcframework.zip"

# Zip JNILibs
if [ -d "$JNI_LIBS_SOURCE_DIR" ]; then
  echo "Zipping JNILibs from $JNI_LIBS_SOURCE_DIR..."
  (cd "$JNI_LIBS_SOURCE_DIR" && zip -r "$ROOT_DIR/flutter/$JNI_LIBS_ZIP_TARGET" . )
  if [ $? -eq 0 ]; then
    echo "JNILibs successfully zipped to $JNI_LIBS_ZIP_TARGET"
  else
    echo "Error: Failed to zip JNILibs."
  fi
elif [ -f "$JNI_LIBS_ZIP_TARGET" ]; then
  echo "Warning: JNILibs source directory $JNI_LIBS_SOURCE_DIR not found, but $JNI_LIBS_ZIP_TARGET already exists. Skipping zip."
else
  echo "Error: JNILibs source directory $JNI_LIBS_SOURCE_DIR not found. Cannot zip."
fi

# Zip XCFramework
if [ -d "$XCFRAMEWORK_SOURCE_DIR" ]; then
  echo "Zipping XCFramework from $XCFRAMEWORK_SOURCE_DIR..."
  (cd "ios" && zip -r "cactus.xcframework.zip" "cactus.xcframework")
  if [ $? -eq 0 ]; then
    echo "XCFramework successfully zipped to $XCFRAMEWORK_ZIP_TARGET"
  else
    echo "Error: Failed to zip XCFramework."
  fi
elif [ -f "$XCFRAMEWORK_ZIP_TARGET" ]; then
  echo "Warning: XCFramework source directory $XCFRAMEWORK_SOURCE_DIR not found, but $XCFRAMEWORK_ZIP_TARGET already exists. Skipping zip."
else
  echo "Error: XCFramework source directory $XCFRAMEWORK_SOURCE_DIR not found. Cannot zip."
fi

echo "Building Cactus Flutter Plugin..."
flutter clean
flutter pub get
dart analyze

echo "Build completed successfully."