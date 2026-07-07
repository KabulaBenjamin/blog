const cloudinary = require('cloudinary').v2;

// 1. Configure Cloudinary with your collected credentials
cloudinary.config({
  cloud_name: 'sy3yp1q8',
  api_key: '233257873797713',
  api_secret: 'J5TyFu5nVkv3LDZXnjGPt8yPluY'
});

async function runOnboarding() {
  try {
    console.log('🚀 Step 1: Uploading sample image to Cloudinary...');
    
    // 2. Upload a sample image from the Cloudinary demo domain
    const uploadResult = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/dog.jpg', {
      folder: 'onboarding_test'
    });

    console.log('\n✅ Upload Success!');
    console.log(`🔗 Secure URL: ${uploadResult.secure_url}`);
    console.log(`🆔 Public ID: ${uploadResult.public_id}`);

    console.log('\n📊 Step 2: Fetching image metadata...');
    // 3. Get image details using the resource API via its public_id
    const details = await cloudinary.api.resource(uploadResult.public_id);
    console.log(`📐 Dimensions: ${details.width}x${details.height} pixels`);
    console.log(`📁 Format: ${details.format}`);
    console.log(`💾 File Size: ${details.bytes} bytes`);

    console.log('\n✨ Step 3: Generating transformed delivery URL...');
    // 4. Transform the image using automatic format and quality profiles
    const transformedUrl = cloudinary.url(uploadResult.public_id, {
      fetch_format: 'auto',
      quality: 'auto',
      secure: true
    });

    console.log('\n🎉 Done! Click link below to see optimized version of the image. Check the size and the format.');
    console.log(`🔗 Optimized URL: ${transformedUrl}`);

  } catch (error) {
    console.error('\n❌ Execution failed during onboarding:', error.message);
  }
}

runOnboarding();
