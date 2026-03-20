class TaglibLegacy < Formula
  desc "Audio metadata library (legacy 1.13.1 build)"
  homepage "https://taglib.org/"
  url "https://taglib.github.io/releases/taglib-1.13.1.tar.gz"
  sha256 "c8da2b10f1bfec2cd7dbfcd33f4a2338db0765d851a50583d410bacf055cfd0b"
  license any_of: ["LGPL-2.1-only", "MPL-1.1"]

  depends_on "cmake" => :build

  uses_from_macos "zlib"

  def install
    system "cmake", "-DWITH_MP4=ON", "-DWITH_ASF=ON", "-DBUILD_SHARED_LIBS=ON",
                    *std_cmake_args
    system "make", "install"
  end

  test do
    assert_match "1.13.1", shell_output("#{bin}/taglib-config --version")
  end
end
